const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

/**
 * 轮询排班算法
 * @param {Array} userIds 用户ID列表
 * @param {Array} shiftIds 班次ID列表
 * @param {String} startDate 开始日期 YYYY-MM-DD
 * @param {String} endDate 结束日期 YYYY-MM-DD
 * @param {Object} options 配置选项
 * @param {Boolean} options.skipHoliday 是否跳过节假日
 * @param {Array} options.excludeDates 排除日期列表
 * @param {Number} options.maxConsecutiveDays 最大连续值班天数
 */
exports.main = async (event, context) => {
  const { userIds, shiftIds, startDate, endDate, options = {} } = event;
  const { skipHoliday = true, excludeDates = [], maxConsecutiveDays = 3 } = options;
  
  if (!userIds || userIds.length === 0) {
    return { code: -1, message: '请选择值班人员' };
  }
  if (!shiftIds || shiftIds.length === 0) {
    return { code: -1, message: '请选择班次' };
  }
  
  try {
    // 获取节假日信息
    let holidays = [];
    if (skipHoliday) {
      const holidayRes = await db.collection('holidays').where({
        date: _.gte(startDate).and(_.lte(endDate))
      }).get();
      holidays = holidayRes.data.map(h => h.date);
    }
    
    // 获取班次信息
    const shiftRes = await db.collection('shifts').where({
      _id: _.in(shiftIds),
      status: 'active'
    }).get();
    const shifts = shiftRes.data;
    
    // 获取日期列表
    const dateList = getDateRange(startDate, endDate);
    
    // 过滤掉节假日和排除日期
    const workDates = dateList.filter(date => {
      if (holidays.includes(date)) return false;
      if (excludeDates.includes(date)) return false;
      return true;
    });
    
    // 轮询分配算法
    const assignments = [];
    let userIndex = 0;
    let userConsecutiveDays = {}; // 记录每人连续值班天数
    
    for (const date of workDates) {
      for (const shift of shifts) {
        // 找到下一个可用的人员
        let attempts = 0;
        while (attempts < userIds.length) {
          const userId = userIds[userIndex];
          const consecutiveDays = userConsecutiveDays[userId] || 0;
          
          // 检查是否超过最大连续值班天数
          if (consecutiveDays < maxConsecutiveDays) {
            assignments.push({
              userId,
              shiftId: shift._id,
              date,
              status: 'pending',
              createTime: db.serverDate()
            });
            
            // 更新连续值班天数
            userConsecutiveDays[userId] = consecutiveDays + 1;
            // 重置其他人的连续天数
            userIds.forEach(id => {
              if (id !== userId) {
                userConsecutiveDays[id] = 0;
              }
            });
            
            // 移动到下一个用户
            userIndex = (userIndex + 1) % userIds.length;
            break;
          }
          
          // 尝试下一个用户
          userIndex = (userIndex + 1) % userIds.length;
          attempts++;
        }
      }
    }
    
    // 批量插入排班数据
    const batchSize = 100;
    const insertResults = [];
    
    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize);
      const result = await Promise.all(
        batch.map(item => db.collection('assignments').add({ data: item }))
      );
      insertResults.push(...result);
    }
    
    return {
      code: 0,
      message: '排班生成成功',
      data: {
        total: assignments.length,
        dates: workDates.length,
        success: insertResults.filter(r => r._id).length
      }
    };
    
  } catch (err) {
    console.error('生成排班失败:', err);
    return { code: -1, message: err.message };
  }
};

// 获取日期范围
function getDateRange(start, end) {
  const dates = [];
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(formatDate(d));
  }
  
  return dates;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
