const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 排班管理云函数
 * 支持操作：
 * - action: 'update' - 更新排班
 * - action: 'delete' - 删除排班
 * - action: 'get' - 获取排班详情（带关联信息）
 */
exports.main = async (event, context) => {
  const { action, assignmentId, data } = event;
  const { OPENID } = cloud.getWXContext();

  try {
    // 验证管理员权限
    const currentUserRes = await db.collection('users').where({ _openid: OPENID }).get();
    const currentUser = currentUserRes.data[0];

    if (!currentUser || currentUser.role !== 'admin') {
      return { code: -1, message: '无权限操作' };
    }

    switch (action) {
      case 'get':
        return await getAssignment(assignmentId);
      case 'update':
        return await updateAssignment(assignmentId, data);
      case 'delete':
        return await deleteAssignment(assignmentId);
      default:
        return { code: -1, message: '未知的操作类型' };
    }
  } catch (err) {
    console.error('排班管理操作失败:', err);
    return { code: -1, message: err.message };
  }
};

/**
 * 获取排班详情（带关联信息）
 */
async function getAssignment(assignmentId) {
  if (!assignmentId) {
    return { code: -1, message: '排班ID不能为空' };
  }

  try {
    const assignmentRes = await db.collection('assignments').doc(assignmentId).get();
    const assignment = assignmentRes.data;

    if (!assignment) {
      return { code: -1, message: '排班记录不存在' };
    }

    // 查询关联信息
    const [userRes, shiftRes] = await Promise.all([
      db.collection('users').doc(assignment.userId).field({
        realName: true,
        avatarUrl: true,
        department: true,
        phone: true
      }).get(),
      db.collection('shifts').doc(assignment.shiftId).get()
    ]);

    return {
      code: 0,
      data: {
        ...assignment,
        userInfo: userRes.data || null,
        shiftInfo: shiftRes.data || null
      }
    };
  } catch (err) {
    console.error('获取排班详情失败:', err);
    return { code: -1, message: err.message };
  }
}

/**
 * 更新排班
 */
async function updateAssignment(assignmentId, data) {
  if (!assignmentId) {
    return { code: -1, message: '排班ID不能为空' };
  }

  if (!data) {
    return { code: -1, message: '更新数据不能为空' };
  }

  // 验证必填字段
  if (!data.date) {
    return { code: -1, message: '日期不能为空' };
  }
  if (!data.shiftId) {
    return { code: -1, message: '班次不能为空' };
  }
  if (!data.userId) {
    return { code: -1, message: '人员不能为空' };
  }

  try {
    // 检查排班记录是否存在
    const assignmentRes = await db.collection('assignments').doc(assignmentId).get();
    if (!assignmentRes.data) {
      return { code: -1, message: '排班记录不存在' };
    }

    // 检查班次是否存在
    const shiftRes = await db.collection('shifts').doc(data.shiftId).get();
    if (!shiftRes.data) {
      return { code: -1, message: '选择的班次不存在' };
    }

    // 检查用户是否存在
    const userRes = await db.collection('users').doc(data.userId).get();
    if (!userRes.data) {
      return { code: -1, message: '选择的人员不存在' };
    }

    // 检查是否存在冲突的排班（同一天同一班次同一人）
    const conflictRes = await db.collection('assignments').where({
      _id: _.neq(assignmentId),
      date: data.date,
      shiftId: data.shiftId,
      userId: data.userId
    }).get();

    if (conflictRes.data.length > 0) {
      return { code: -1, message: '该人员在该日期已有相同班次的排班' };
    }

    // 执行更新
    await db.collection('assignments').doc(assignmentId).update({
      data: {
        date: data.date,
        shiftId: data.shiftId,
        userId: data.userId,
        updateTime: db.serverDate()
      }
    });

    return { code: 0, message: '更新成功' };
  } catch (err) {
    console.error('更新排班失败:', err);
    return { code: -1, message: err.message };
  }
}

/**
 * 删除排班
 */
async function deleteAssignment(assignmentId) {
  if (!assignmentId) {
    return { code: -1, message: '排班ID不能为空' };
  }

  try {
    // 检查排班记录是否存在
    const assignmentRes = await db.collection('assignments').doc(assignmentId).get();
    if (!assignmentRes.data) {
      return { code: -1, message: '排班记录不存在' };
    }

    // 检查排班状态，已签到的排班可能需要特殊处理
    const assignment = assignmentRes.data;
    if (assignment.status === 'checked_in' || assignment.status === 'checked_out') {
      // 可以选择禁止删除或仅警告，这里选择允许删除但记录日志
      console.log(`删除已签到排班: ${assignmentId}, 状态: ${assignment.status}`);
    }

    // 执行删除
    await db.collection('assignments').doc(assignmentId).remove();

    return { code: 0, message: '删除成功' };
  } catch (err) {
    console.error('删除排班失败:', err);
    return { code: -1, message: err.message };
  }
}
