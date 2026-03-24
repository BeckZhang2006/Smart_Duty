const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 节假日管理
 * @param {String} action list/create/delete
 */
exports.main = async (event, context) => {
  const { action } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 验证管理员权限（list 操作不需要权限验证）
    if (action !== 'list') {
      const userRes = await db.collection('users').where({ _openid: OPENID }).get();
      if (userRes.data.length === 0 || userRes.data[0].role !== 'admin') {
        return { code: -1, message: '无权限执行此操作' };
      }
    }
    
    switch (action) {
      case 'list':
        return await listHolidays(event);
      case 'create':
        return await createHoliday(event);
      case 'delete':
        return await deleteHoliday(event);
      default:
        return { code: -1, message: '未知操作' };
    }
  } catch (err) {
    console.error('节假日操作失败:', err);
    return { code: -1, message: err.message || '操作失败' };
  }
};

/**
 * 查询节假日列表
 */
async function listHolidays(event) {
  try {
    const { year } = event;
    
    let where = {};
    
    // 如果指定了年份，筛选该年份的数据
    if (year) {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      where.date = _.gte(startDate).and(_.lte(endDate));
    }
    
    const res = await db.collection('holidays')
      .where(where)
      .orderBy('date', 'asc')
      .get();
    
    return { code: 0, data: res.data };
  } catch (err) {
    console.error('获取节假日列表失败:', err);
    return { code: -1, message: err.message || '获取节假日列表失败' };
  }
}

/**
 * 创建节假日
 */
async function createHoliday(event) {
  try {
    const { date, name, type = 'holiday' } = event;
    
    // 参数验证
    if (!date || !name) {
      return { code: -1, message: '日期和名称不能为空' };
    }
    
    // 验证日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return { code: -1, message: '日期格式不正确，应为 YYYY-MM-DD' };
    }
    
    // 验证类型
    const validTypes = ['holiday', 'workday', 'other'];
    if (!validTypes.includes(type)) {
      return { code: -1, message: '类型不正确' };
    }
    
    // 检查是否已存在相同日期的节假日
    const existRes = await db.collection('holidays').where({ date }).get();
    if (existRes.data.length > 0) {
      return { code: -1, message: '该日期已存在节假日' };
    }
    
    // 创建节假日
    const result = await db.collection('holidays').add({
      data: {
        date,
        name: name.trim(),
        type,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });
    
    return { code: 0, message: '创建成功', data: { id: result._id } };
  } catch (err) {
    console.error('创建节假日失败:', err);
    return { code: -1, message: err.message || '创建节假日失败' };
  }
}

/**
 * 删除节假日
 */
async function deleteHoliday(event) {
  try {
    const { id } = event;
    
    if (!id) {
      return { code: -1, message: 'ID不能为空' };
    }
    
    // 检查是否存在
    const existRes = await db.collection('holidays').doc(id).get();
    if (!existRes.data) {
      return { code: -1, message: '节假日不存在' };
    }
    
    await db.collection('holidays').doc(id).remove();
    
    return { code: 0, message: '删除成功' };
  } catch (err) {
    console.error('删除节假日失败:', err);
    return { code: -1, message: err.message || '删除节假日失败' };
  }
}
