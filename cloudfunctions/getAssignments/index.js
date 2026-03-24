const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 获取排班列表（关联查询shift和user信息）
 * @param {String} userId 用户ID（可选，不传则查全部）
 * @param {String} startDate 开始日期
 * @param {String} endDate 结束日期
 */
exports.main = async (event, context) => {
  const { userId, startDate, endDate } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 获取当前用户信息，验证权限
    const currentUserRes = await db.collection('users').where({ _openid: OPENID }).get();
    const currentUser = currentUserRes.data[0];
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    // 构建查询条件
    let where = {
      date: _.gte(startDate).and(_.lte(endDate))
    };
    
    // 非管理员只能查看自己的
    if (!isAdmin && currentUser) {
      where.userId = currentUser._id;
    }
    
    // 查询排班
    const assignmentRes = await db.collection('assignments').where(where)
      .orderBy('date', 'asc')
      .get();
    
    const assignments = assignmentRes.data;
    
    if (assignments.length === 0) {
      return { code: 0, data: [] };
    }
    
    // 获取关联的用户ID和班次ID
    const userIds = [...new Set(assignments.map(a => a.userId))];
    const shiftIds = [...new Set(assignments.map(a => a.shiftId))];
    
    // 批量查询用户信息
    const userRes = await db.collection('users').where({
      _id: _.in(userIds)
    }).field({
      realName: true,
      avatarUrl: true,
      department: true,
      phone: true
    }).get();
    const userMap = {};
    userRes.data.forEach(u => userMap[u._id] = u);
    
    // 批量查询班次信息
    const shiftRes = await db.collection('shifts').where({
      _id: _.in(shiftIds)
    }).get();
    const shiftMap = {};
    shiftRes.data.forEach(s => shiftMap[s._id] = s);
    
    // 合并数据
    const result = assignments.map(a => ({
      ...a,
      userInfo: userMap[a.userId] || null,
      shiftInfo: shiftMap[a.shiftId] || null,
      // 判断班次是否跨天
      isOvernight: shiftMap[a.shiftId] ? 
        isOvernight(shiftMap[a.shiftId].startTime, shiftMap[a.shiftId].endTime) : false
    }));
    
    return { code: 0, data: result };
    
  } catch (err) {
    console.error('获取排班失败:', err);
    return { code: -1, message: err.message };
  }
};

// 判断班次是否跨天
function isOvernight(startTime, endTime) {
  const start = new Date(`2000-01-01 ${startTime}`);
  const end = new Date(`2000-01-01 ${endTime}`);
  return end <= start;
}
