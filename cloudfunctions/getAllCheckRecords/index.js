const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 获取所有打卡记录（管理员可查所有人，普通用户只能查自己）
 * @param {String} startDate 开始日期
 * @param {String} endDate 结束日期
 * @param {Boolean} isAdmin 是否管理员（前端传入，后端会验证）
 */
exports.main = async (event, context) => {
  const { startDate, endDate } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 获取当前用户信息并验证权限
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }
    const currentUser = userRes.data[0];
    const isAdmin = currentUser.role === 'admin';
    
    // 查询条件
    let assignWhere = {
      date: _.gte(startDate).and(_.lte(endDate))
    };
    let checkWhere = {
      date: _.gte(startDate).and(_.lte(endDate))
    };
    
    // 非管理员只能查看自己的
    if (!isAdmin) {
      assignWhere.userId = currentUser._id;
      checkWhere.userId = currentUser._id;
    }
    
    // 查询排班记录
    let assignments = [];
    try {
      const assignRes = await db.collection('assignments').where(assignWhere)
        .orderBy('date', 'desc')
        .get();
      assignments = assignRes.data;
    } catch (err) {
      console.log('查询排班失败:', err);
    }
    
    // 查询自由打卡记录
    let checkRecords = [];
    try {
      const checkRes = await db.collection('checkRecords').where(checkWhere)
        .orderBy('date', 'desc')
        .orderBy('createTime', 'desc')
        .get();
      checkRecords = checkRes.data;
    } catch (err) {
      if (err.errCode !== -502005) {
        console.log('查询打卡记录失败:', err);
      }
    }
    
    // 获取所有相关用户ID（用于查询用户信息）
    const userIds = [...new Set([
      ...assignments.map(a => a.userId),
      ...checkRecords.map(c => c.userId)
    ])].filter(Boolean);
    
    // 批量查询用户信息
    let userMap = {};
    if (userIds.length > 0) {
      // 分批查询，避免超过限制
      const batchSize = 100;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const userRes = await db.collection('users').where({
          _id: _.in(batch)
        }).field({
          realName: true,
          nickName: true,
          avatarUrl: true,
          department: true
        }).get();
        userRes.data.forEach(u => {
          userMap[u._id] = u;
        });
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
      userInfo: userMap[a.userId] || null,
      shiftInfo: shiftMap[a.shiftId] || { name: '未知班次', startTime: '', endTime: '' }
    }));
    
    // 处理自由打卡记录（排除已有排班的日期）
    const assignDateUserMap = new Set(assignments.map(a => `${a.date}_${a.userId}`));
    const freeRecords = checkRecords
      .filter(c => !assignDateUserMap.has(`${c.date}_${c.userId}`))
      .map(c => ({
        ...c,
        recordType: 'free',
        userInfo: userMap[c.userId] || null,
        shiftInfo: { name: '自由打卡', startTime: '09:00', endTime: '18:00' }
      }));
    
    // 合并并排序
    const allRecords = [...assignRecords, ...freeRecords].sort((a, b) => {
      // 先按日期倒序
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      // 再按创建时间倒序（处理 Date 对象和字符串）
      const aTime = a.createTime ? new Date(a.createTime).getTime() : 
                   (a.checkInTime ? new Date(a.checkInTime).getTime() : 0);
      const bTime = b.createTime ? new Date(b.createTime).getTime() : 
                   (b.checkInTime ? new Date(b.checkInTime).getTime() : 0);
      return bTime - aTime;
    });
    
    return {
      code: 0,
      data: allRecords
    };
    
  } catch (err) {
    console.error('获取打卡记录失败:', err);
    return { code: -1, message: err.message };
  }
};
