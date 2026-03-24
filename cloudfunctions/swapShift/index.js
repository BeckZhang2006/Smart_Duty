const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 换班申请与审批
 * @param {String} action 操作：apply / approve / reject / cancel / list
 */
exports.main = async (event, context) => {
  const { action } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 获取当前用户
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }
    const currentUser = userRes.data[0];
    
    // 确保 isAdmin 字段存在
    if (currentUser.role === 'admin' && currentUser.isAdmin === undefined) {
      currentUser.isAdmin = true;
    }
    
    switch (action) {
      case 'apply':
        return await applySwap(event, currentUser);
      case 'approve':
        return await approveSwap(event, currentUser);
      case 'reject':
        return await rejectSwap(event, currentUser);
      case 'cancel':
        return await cancelSwap(event, currentUser);
      case 'list':
        return await listSwaps(event, currentUser);
      default:
        return { code: -1, message: '未知操作' };
    }
    
  } catch (err) {
    console.error('换班操作失败:', err);
    return { code: -1, message: err.message || '操作失败' };
  }
};

// 申请换班
async function applySwap(event, currentUser) {
  const { fromAssignmentId, toUserId, toAssignmentId, reason } = event;
  
  try {
    // 验证排班是否存在
    const fromRes = await db.collection('assignments').doc(fromAssignmentId).get();
    if (!fromRes.data) {
      return { code: -1, message: '原排班不存在' };
    }
    
    const fromAssignment = fromRes.data;
    
    // 验证排班属于当前用户
    if (fromAssignment.userId !== currentUser._id) {
      return { code: -1, message: '只能申请换自己的班' };
    }
    
    // 验证排班状态
    if (fromAssignment.status === 'checked_out') {
      return { code: -1, message: '已完成值班的排班不能换班' };
    }
    if (fromAssignment.isSwapped) {
      return { code: -1, message: '该排班已换班' };
    }
    
    // 验证目标用户是否存在
    const toUserRes = await db.collection('users').doc(toUserId).get();
    if (!toUserRes.data) {
      return { code: -1, message: '目标用户不存在' };
    }
    
    // 验证目标排班（如果指定了）
    if (toAssignmentId) {
      const toRes = await db.collection('assignments').doc(toAssignmentId).get();
      if (!toRes.data) {
        return { code: -1, message: '目标排班不存在' };
      }
      if (toRes.data.userId !== toUserId) {
        return { code: -1, message: '目标排班不属于目标用户' };
      }
    }
    
    // 创建换班申请
    const swapData = {
      fromUserId: currentUser._id,
      toUserId,
      fromAssignmentId,
      toAssignmentId: toAssignmentId || null,
      reason,
      status: 'pending',
      createTime: db.serverDate()
    };
    
    const result = await db.collection('swapRequests').add({ data: swapData });
    
    // 更新原排班状态
    await db.collection('assignments').doc(fromAssignmentId).update({
      data: { status: 'swap_pending' }
    });
    
    return {
      code: 0,
      message: '换班申请已提交',
      data: { id: result._id }
    };
  } catch (err) {
    console.error('申请换班失败:', err);
    return { code: -1, message: err.message || '申请换班失败' };
  }
}

// 审批通过
async function approveSwap(event, currentUser) {
  const { swapId } = event;
  
  try {
    const swapRes = await db.collection('swapRequests').doc(swapId).get();
    if (!swapRes.data) {
      return { code: -1, message: '换班申请不存在' };
    }
    
    const swap = swapRes.data;
    
    // 验证权限（管理员或目标用户可以审批）
    if (!currentUser.isAdmin && swap.toUserId !== currentUser._id) {
      return { code: -1, message: '无权审批此申请' };
    }
    
    if (swap.status !== 'pending') {
      return { code: -1, message: '该申请已处理' };
    }
    
    // 获取原排班
    const fromRes = await db.collection('assignments').doc(swap.fromAssignmentId).get();
    if (!fromRes.data) {
      return { code: -1, message: '原排班不存在' };
    }
    const fromAssignment = fromRes.data;
    
    // 更新换班申请状态
    await db.collection('swapRequests').doc(swapId).update({
      data: {
        status: 'approved',
        approverId: currentUser._id,
        approveTime: db.serverDate()
      }
    });
    
    // 更新原排班
    await db.collection('assignments').doc(swap.fromAssignmentId).update({
      data: {
        userId: swap.toUserId,
        originalUserId: fromAssignment.userId,
        isSwapped: true,
        status: 'pending'
      }
    });
    
    // 如果有目标排班，则互换
    if (swap.toAssignmentId) {
      const toRes = await db.collection('assignments').doc(swap.toAssignmentId).get();
      if (toRes.data) {
        const toAssignment = toRes.data;
        
        await db.collection('assignments').doc(swap.toAssignmentId).update({
          data: {
            userId: fromAssignment.userId,
            originalUserId: toAssignment.userId,
            isSwapped: true,
            status: 'pending'
          }
        });
      }
    }
    
    return { code: 0, message: '换班申请已通过' };
  } catch (err) {
    console.error('审批换班失败:', err);
    return { code: -1, message: err.message || '审批换班失败' };
  }
}

// 审批拒绝
async function rejectSwap(event, currentUser) {
  const { swapId, remark } = event;
  
  try {
    const swapRes = await db.collection('swapRequests').doc(swapId).get();
    if (!swapRes.data) {
      return { code: -1, message: '换班申请不存在' };
    }
    
    const swap = swapRes.data;
    
    // 验证权限
    if (!currentUser.isAdmin && swap.toUserId !== currentUser._id) {
      return { code: -1, message: '无权审批此申请' };
    }
    
    // 更新申请状态
    await db.collection('swapRequests').doc(swapId).update({
      data: {
        status: 'rejected',
        approverId: currentUser._id,
        approveTime: db.serverDate(),
        approveRemark: remark
      }
    });
    
    // 恢复排班状态
    await db.collection('assignments').doc(swap.fromAssignmentId).update({
      data: { status: 'pending' }
    });
    
    return { code: 0, message: '换班申请已拒绝' };
  } catch (err) {
    console.error('拒绝换班失败:', err);
    return { code: -1, message: err.message || '拒绝换班失败' };
  }
}

// 取消申请
async function cancelSwap(event, currentUser) {
  const { swapId } = event;
  
  try {
    const swapRes = await db.collection('swapRequests').doc(swapId).get();
    if (!swapRes.data) {
      return { code: -1, message: '换班申请不存在' };
    }
    
    const swap = swapRes.data;
    
    // 只能取消自己的申请
    if (swap.fromUserId !== currentUser._id) {
      return { code: -1, message: '无权取消此申请' };
    }
    
    if (swap.status !== 'pending') {
      return { code: -1, message: '该申请已处理，无法取消' };
    }
    
    // 更新申请状态
    await db.collection('swapRequests').doc(swapId).update({
      data: { status: 'cancelled' }
    });
    
    // 恢复排班状态
    await db.collection('assignments').doc(swap.fromAssignmentId).update({
      data: { status: 'pending' }
    });
    
    return { code: 0, message: '换班申请已取消' };
  } catch (err) {
    console.error('取消换班失败:', err);
    return { code: -1, message: err.message || '取消换班失败' };
  }
}

// 查询列表
async function listSwaps(event, currentUser) {
  const { type = 'all' } = event; // all / sent / received
  
  try {
    let where = {};
    
    if (type === 'sent') {
      where.fromUserId = currentUser._id;
    } else if (type === 'received') {
      where.toUserId = currentUser._id;
    } else {
      // 所有相关的
      where = _.or([
        { fromUserId: currentUser._id },
        { toUserId: currentUser._id }
      ]);
    }
    
    const res = await db.collection('swapRequests')
      .where(where)
      .orderBy('createTime', 'desc')
      .get();
    
    // 关联查询用户信息
    const userIds = [...new Set([
      ...res.data.map(s => s.fromUserId),
      ...res.data.map(s => s.toUserId)
    ])];
    
    const userRes = await db.collection('users').where({
      _id: _.in(userIds)
    }).field({ realName: true, avatarUrl: true }).get();
    
    const userMap = {};
    userRes.data.forEach(u => userMap[u._id] = u);
    
    const result = res.data.map(s => ({
      ...s,
      fromUser: userMap[s.fromUserId],
      toUser: userMap[s.toUserId]
    }));
    
    return { code: 0, data: result };
  } catch (err) {
    console.error('查询换班列表失败:', err);
    return { code: -1, message: err.message || '查询换班列表失败' };
  }
}
