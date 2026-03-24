const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 用户注册
 * @param {String} realName 真实姓名
 * @param {String} phone 手机号
 * @param {String} department 部门
 * @param {String} avatarUrl 头像URL
 * @param {String} nickName 昵称
 */
exports.main = async (event, context) => {
  const { realName, phone, department, avatarUrl, nickName } = event;
  const { OPENID } = cloud.getWXContext();
  
  // 参数验证
  if (!realName || !phone) {
    return { code: -1, message: '姓名和手机号不能为空' };
  }
  
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return { code: -1, message: '手机号格式不正确' };
  }
  
  try {
    // 检查用户是否已存在
    const existRes = await db.collection('users').where({
      _openid: OPENID
    }).get();
    
    if (existRes.data.length > 0) {
      return { code: -1, message: '用户已注册' };
    }
    
    // 检查手机号是否已被使用
    const phoneRes = await db.collection('users').where({
      phone: phone
    }).get();
    
    if (phoneRes.data.length > 0) {
      return { code: -1, message: '该手机号已被注册' };
    }
    
    // 创建用户数据
    const userData = {
      _openid: OPENID,
      realName: realName.trim(),
      phone: phone,
      department: department ? department.trim() : '',
      avatarUrl: avatarUrl || '',
      nickName: nickName || '',
      role: 'staff', // 默认为员工，管理员需手动设置
      isAdmin: false,
      status: 'active',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    };
    
    const result = await db.collection('users').add({
      data: userData
    });
    
    return {
      code: 0,
      message: '注册成功',
      data: {
        _id: result._id,
        ...userData
      }
    };
    
  } catch (err) {
    console.error('注册失败:', err);
    return { code: -1, message: err.message || '注册失败' };
  }
};
