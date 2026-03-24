const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 按周模板生成排班
 * @param {Array} weekTemplate 周模板配置
 * @param {String} startDate 开始日期
 * @param {String} endDate 结束日期
 */
exports.main = async (event, context) => {
  const { weekTemplate, startDate, endDate } = event;
  const { OPENID } = cloud.getWXContext();
  
  // 参数验证
  if (!startDate || !endDate) {
    return { code: -1, message: '开始日期和结束日期不能为空' };
  }
  
  try {
    // 验证管理员权限
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();
    if (userRes.data.length === 0 || userRes.data[0].role !== 'admin') {
      return { code: -1, message: '无权操作' };
    }
    
    // 获取或创建班次
    const dayShift = await getOrCreateShift('白天班', '07:40', '18:00');
    const nightShift = await getOrCreateShift('晚上班', '18:40', '21:00');
    
    // 解析周模板
    let template = weekTemplate || getDefaultTemplate();
    
    // 查询所有用户，建立姓名到userId的映射
    const userMap = new Map();
    try {
      const usersRes = await db.collection('users').field({ realName: true }).get();
      usersRes.data.forEach(u => {
        if (u.realName) {
          userMap.set(u.realName, u._id);
        }
      });
    } catch (err) {
      console.log('查询用户失败:', err);
    }
    
    // 转换模板中的姓名为userId
    template = template.map(day => ({
      day: userMap.get(day.day) || day.day,
      night: userMap.get(day.night) || day.night
    }));
    
    // 生成日期范围
    const dates = generateDateRange(startDate, endDate);
    
    // 限制日期范围（最多16周，约4个月）
    if (dates.length > 120) {
      return { 
        code: -1, 
        message: '日期范围过大，最多支持16周（约4个月）' 
      };
    }
    
    // 批量创建排班
    const assignments = [];
    
    for (const date of dates) {
      const dayOfWeek = new Date(date).getDay(); // 0=周日, 1=周一, ..., 6=周六
      const weekDay = dayOfWeek === 0 ? 7 : dayOfWeek; // 转换为1-7，1=周一
      
      // 只生成周一到周五的排班
      if (weekDay > 5) continue;
      
      const dayConfig = template[weekDay - 1]; // 索引从0开始
      
      // 白天班
      if (dayShift && dayConfig.day) {
        assignments.push({
          userId: dayConfig.day,
          shiftId: dayShift._id,
          date: date,
          status: 'pending',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        });
      }
      
      // 晚上班
      if (nightShift && dayConfig.night) {
        assignments.push({
          userId: dayConfig.night,
          shiftId: nightShift._id,
          date: date,
          status: 'pending',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        });
      }
    }
    
    // 批量查询已存在的排班（优化性能）
    const existingSet = new Set();
    try {
      const existingRes = await db.collection('assignments').where({
        date: _.gte(startDate).and(_.lte(endDate))
      }).field({
        userId: true,
        shiftId: true,
        date: true
      }).get();
      
      existingRes.data.forEach(item => {
        const key = `${item.date}_${item.shiftId}_${item.userId}`;
        existingSet.add(key);
      });
    } catch (err) {
      console.log('查询现有排班失败:', err);
    }
    
    // 过滤掉已存在的排班
    const newAssignments = assignments.filter(a => {
      const key = `${a.date}_${a.shiftId}_${a.userId}`;
      return !existingSet.has(key);
    });
    
    // 批量插入（使用 Promise.all 并行处理）
    const batchSize = 20; // 每批20条
    let createdCount = 0;
    
    for (let i = 0; i < newAssignments.length; i += batchSize) {
      const batch = newAssignments.slice(i, i + batchSize);
      const promises = batch.map(assignment => 
        db.collection('assignments').add({ data: assignment })
          .then(() => true)
          .catch(err => {
            console.error('创建排班失败:', err);
            return false;
          })
      );
      
      const results = await Promise.all(promises);
      createdCount += results.filter(r => r).length;
    }
    
    return {
      code: 0,
      message: `成功生成${createdCount}条排班，跳过${assignments.length - newAssignments.length}条已存在`,
      data: { 
        createdCount,
        skippedCount: assignments.length - newAssignments.length,
        totalCount: assignments.length
      }
    };
    
  } catch (err) {
    console.error('生成排班失败:', err);
    return { code: -1, message: err.message || '生成排班失败' };
  }
};

// 获取或创建班次
async function getOrCreateShift(name, startTime, endTime) {
  try {
    const db = cloud.database();
    
    let shift = await db.collection('shifts').where({ name }).get();
    
    if (shift.data.length > 0) {
      return shift.data[0];
    }
    
    // 创建新班次
    const res = await db.collection('shifts').add({
      data: {
        name,
        startTime,
        endTime,
        location: {
          name: '电教中心办公室',
          latitude: 36.67787272135417,
          longitude: 116.97408718532986,
          radius: 500
        },
        color: name === '白天班' ? '#07c160' : '#1989fa',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });
    
    return {
      _id: res._id,
      name,
      startTime,
      endTime
    };
  } catch (err) {
    console.error('获取或创建班次失败:', err);
    throw err;
  }
}

// 生成日期范围
function generateDateRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(formatDate(d));
  }
  
  return dates;
}

// 格式化日期
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 获取默认周模板（根据图片中的排班表）
function getDefaultTemplate() {
  return [
    { day: '王超然', night: '尚攸成' },    // 周一
    { day: '王家祎', night: '徐丞昱' },    // 周二
    { day: '孔馨晨', night: '张兆睿' },    // 周三
    { day: '张兆睿', night: '王家祎' },    // 周四
    { day: '尚攸成', night: '孔馨晨' }     // 周五
  ];
}
