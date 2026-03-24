const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { assignmentId, handover } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 验证权限
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }
    
    const user = userRes.data[0];
    
    // 验证排班归属
    const assignRes = await db.collection('assignments').doc(assignmentId).get();
    if (assignRes.data.userId !== user._id) {
      return { code: -1, message: '无权操作' };
    }
    
    // 保存交接班信息
    await db.collection('assignments').doc(assignmentId).update({
      data: {
        handoverContent: handover.content,
        handoverItems: handover.items,
        handoverEquipment: {
          status: handover.equipmentStatus,
          remark: handover.equipmentRemark
        },
        handoverTodos: handover.todos,
        handoverRemarks: handover.remarks,
        handoverSignature: handover.signature,
        handoverTime: db.serverDate()
      }
    });
    
    return { code: 0, message: '交接班成功' };
  } catch (err) {
    return { code: -1, message: err.message };
  }
};
