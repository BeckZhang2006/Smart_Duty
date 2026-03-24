const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action = 'list', department, role, excludeCurrentUser } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 获取当前用户ID（如果需要排除）
    let currentUserId = null;
    if (excludeCurrentUser) {
      const currentUserRes = await db.collection('users').where({
        _openid: OPENID
      }).field({ _id: true }).get();
      if (currentUserRes.data.length > 0) {
        currentUserId = currentUserRes.data[0]._id;
      }
    }
    
    if (action === 'count') {
      let countWhere = { status: 'active' };
      if (currentUserId) {
        countWhere._id = db.command.neq(currentUserId);
      }
      const countRes = await db.collection('users').where(countWhere).count();
      return { code: 0, data: { count: countRes.total } };
    }
    
    let where = { status: 'active' };
    if (department) where.department = department;
    if (role) where.role = role;
    if (currentUserId) {
      where._id = db.command.neq(currentUserId);
    }
    
    const res = await db.collection('users')
      .where(where)
      .field({
        realName: true,
        avatarUrl: true,
        department: true,
        role: true,
        phone: true
      })
      .get();
    
    return { code: 0, data: res.data };
  } catch (err) {
    return { code: -1, message: err.message };
  }
};
