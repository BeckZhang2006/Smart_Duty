const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 查询用户是否已注册
    const userRes = await db.collection('users').where({
      _openid: OPENID
    }).get();
    
    if (userRes.data.length > 0) {
      const user = userRes.data[0];
      return {
        code: 0,
        openid: OPENID,
        userInfo: user,
        isAdmin: user.role === 'admin',
        isRegistered: true
      };
    }
    
    // 未注册用户
    return {
      code: 0,
      openid: OPENID,
      userInfo: null,
      isAdmin: false,
      isRegistered: false
    };
    
  } catch (err) {
    console.error('获取用户信息失败:', err);
    return {
      code: -1,
      message: err.message || '获取用户信息失败',
      openid: OPENID,
      isRegistered: false,
      isAdmin: false
    };
  }
};
