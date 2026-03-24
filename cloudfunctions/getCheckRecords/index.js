const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 获取打卡记录（包括排班和自由打卡）
 * @param {String} startDate 开始日期
 * @param {String} endDate 结束日期
 */
exports.main = async (event, context) => {
  const { startDate, endDate } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 获取当前用户信息
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }
    const user = userRes.data[0];
    
    // 查询排班记录
    let assignments = [];
    try {
      const assignRes = await db.collection('assignments').where({
        userId: user._id,
        date: _.gte(startDate).and(_.lte(endDate))
      }).orderBy('date', 'desc').get();
      assignments = assignRes.data;
    } catch (err) {
      console.log('查询排班失败:', err);
    }
    
    // 查询自由打卡记录
    let checkRecords = [];
    try {
      const checkRes = await db.collection('checkRecords').where({
        userId: user._id,
        date: _.gte(startDate).and(_.lte(endDate))
      }).orderBy('date', 'desc').get();
      checkRecords = checkRes.data;
    } catch (err) {
      // 集合不存在时忽略
      if (err.errCode !== -502005) {
        console.log('查询打卡记录失败:', err);
      }
    }
    
    // 获取排班关联的班次信息
    const shiftIds = [...new Set(assignments.map(a => a.shiftId).filter(Boolean))];
    let shiftMap = {};
    if (shiftIds.length > 0) {
      const shiftRes = await db.collection('shifts').where({
        _id: _.in(shiftIds)
      }).get();
      shiftRes.data.forEach(s => shiftMap[s._id] = s);
    }
    
    // 处理排班记录
    const assignRecords = assignments.map(a => ({
      ...a,
      recordType: 'assignment',
      shiftInfo: shiftMap[a.shiftId] || { name: '未知班次', startTime: '', endTime: '' }
    }));
    
    // 处理自由打卡记录（排除已有排班的日期）
    const assignDates = new Set(assignments.map(a => a.date));
    const freeRecords = checkRecords
      .filter(c => !assignDates.has(c.date))
      .map(c => ({
        ...c,
        recordType: 'free',
        shiftInfo: { name: '自由打卡', startTime: '09:00', endTime: '18:00' }
      }));
    
    // 合并并排序
    const allRecords = [...assignRecords, ...freeRecords].sort((a, b) => 
      b.date.localeCompare(a.date)
    );
    
    return {
      code: 0,
      data: allRecords
    };
    
  } catch (err) {
    console.error('获取打卡记录失败:', err);
    return { code: -1, message: err.message };
  }
};
