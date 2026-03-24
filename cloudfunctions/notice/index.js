const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 公告管理
 * @param {String} action list/create/update/delete
 */
exports.main = async (event, context) => {
  const { action } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 验证管理员权限（list操作除外）
    if (action !== 'list') {
      const userRes = await db.collection('users').where({ _openid: OPENID }).get();
      if (userRes.data.length === 0 || userRes.data[0].role !== 'admin') {
        return { code: -1, message: '无权限执行此操作' };
      }
    }
    
    switch (action) {
      case 'list':
        return await listNotices(event);
      case 'create':
        return await createNotice(event);
      case 'update':
        return await updateNotice(event);
      case 'delete':
        return await deleteNotice(event);
      default:
        return { code: -1, message: '未知操作' };
    }
  } catch (err) {
    console.error('公告操作失败:', err);
    return { code: -1, message: err.message || '操作失败' };
  }
};

async function listNotices(event) {
  try {
    const { limit = 10, type } = event;
    
    let where = { status: 'active' };
    if (type) where.type = type;
    
    const res = await db.collection('notices')
      .where(where)
      .orderBy('isTop', 'desc')
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get();
    
    return { code: 0, data: res.data };
  } catch (err) {
    console.error('获取公告列表失败:', err);
    return { code: -1, message: err.message || '获取公告列表失败' };
  }
}

async function createNotice(event) {
  try {
    const { title, content, type = 'system', isTop = false } = event;
    
    if (!title || !content) {
      return { code: -1, message: '标题和内容不能为空' };
    }
    
    const result = await db.collection('notices').add({
      data: {
        title: title.trim(),
        content: content.trim(),
        type,
        isTop,
        readCount: 0,
        status: 'active',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });
    
    return { code: 0, message: '创建成功', data: { id: result._id } };
  } catch (err) {
    console.error('创建公告失败:', err);
    return { code: -1, message: err.message || '创建公告失败' };
  }
}

async function updateNotice(event) {
  try {
    const { id, title, content, type, isTop } = event;
    
    if (!id) {
      return { code: -1, message: '公告ID不能为空' };
    }
    
    const updateData = {
      updateTime: db.serverDate()
    };
    
    if (title !== undefined) updateData.title = title.trim();
    if (content !== undefined) updateData.content = content.trim();
    if (type !== undefined) updateData.type = type;
    if (isTop !== undefined) updateData.isTop = isTop;
    
    await db.collection('notices').doc(id).update({ data: updateData });
    
    return { code: 0, message: '更新成功' };
  } catch (err) {
    console.error('更新公告失败:', err);
    return { code: -1, message: err.message || '更新公告失败' };
  }
}

async function deleteNotice(event) {
  try {
    const { id } = event;
    
    if (!id) {
      return { code: -1, message: '公告ID不能为空' };
    }
    
    await db.collection('notices').doc(id).update({
      data: { 
        status: 'inactive',
        updateTime: db.serverDate()
      }
    });
    
    return { code: 0, message: '删除成功' };
  } catch (err) {
    console.error('删除公告失败:', err);
    return { code: -1, message: err.message || '删除公告失败' };
  }
}
