const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;
const ExcelJS = require('exceljs');

/**
 * 数据导出云函数
 * @param {String} action 导出类型：exportSchedule / exportCheckRecords / exportStatistics
 * @param {String} startDate 开始日期
 * @param {String} endDate 结束日期
 * @param {String} month 月份 YYYY-MM
 * @param {String} userId 用户ID（可选）
 */
exports.main = async (event, context) => {
  const { action, startDate, endDate, month, userId } = event;
  const { OPENID } = cloud.getWXContext();

  try {
    // 验证管理员权限
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }
    const currentUser = userRes.data[0];
    if (currentUser.role !== 'admin') {
      return { code: -1, message: '无权导出数据' };
    }

    switch (action) {
      case 'exportSchedule':
        return await exportSchedule(startDate, endDate);
      case 'exportCheckRecords':
        return await exportCheckRecords(startDate, endDate, userId);
      case 'exportStatistics':
        return await exportStatistics(month);
      default:
        return { code: -1, message: '未知的导出类型' };
    }
  } catch (err) {
    console.error('导出失败:', err);
    return { code: -1, message: err.message };
  }
};

/**
 * 导出排班表
 */
async function exportSchedule(startDate, endDate) {
  if (!startDate || !endDate) {
    return { code: -1, message: '请指定日期范围' };
  }

  // 查询排班数据
  const assignmentRes = await db.collection('assignments').where({
    date: _.gte(startDate).and(_.lte(endDate))
  }).orderBy('date', 'asc').get();

  const assignments = assignmentRes.data;

  if (assignments.length === 0) {
    return { code: -1, message: '该时间段内没有排班数据' };
  }

  // 获取关联数据
  const userIds = [...new Set(assignments.map(a => a.userId))];
  const shiftIds = [...new Set(assignments.map(a => a.shiftId))];

  const [userRes, shiftRes] = await Promise.all([
    db.collection('users').where({ _id: _.in(userIds) }).get(),
    db.collection('shifts').where({ _id: _.in(shiftIds) }).get()
  ]);

  const userMap = {};
  userRes.data.forEach(u => userMap[u._id] = u);

  const shiftMap = {};
  shiftRes.data.forEach(s => shiftMap[s._id] = s);

  // 创建工作簿
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('排班表');

  // 设置表头
  worksheet.columns = [
    { header: '日期', key: 'date', width: 15 },
    { header: '班次名称', key: 'shiftName', width: 20 },
    { header: '值班人员', key: 'userName', width: 15 },
    { header: '部门', key: 'department', width: 15 },
    { header: '班次时间', key: 'shiftTime', width: 20 },
    { header: '状态', key: 'status', width: 12 }
  ];

  // 设置表头样式
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF07C160' }
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // 状态映射
  const statusMap = {
    'pending': '待签到',
    'checked_in': '值班中',
    'checked_out': '已完成',
    'absent': '缺勤'
  };

  // 添加数据
  assignments.forEach(item => {
    const user = userMap[item.userId] || {};
    const shift = shiftMap[item.shiftId] || {};

    worksheet.addRow({
      date: item.date,
      shiftName: shift.name || '未知班次',
      userName: user.realName || '未知人员',
      department: user.department || '-',
      shiftTime: shift.startTime && shift.endTime ? `${shift.startTime} - ${shift.endTime}` : '-',
      status: statusMap[item.status] || item.status
    });
  });

  // 添加边框
  worksheet.eachRow(row => {
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // 生成文件并上传
  return await uploadWorkbook(workbook, `排班表_${startDate}_${endDate}.xlsx`);
}

/**
 * 导出打卡记录
 */
async function exportCheckRecords(startDate, endDate, userId) {
  if (!startDate || !endDate) {
    return { code: -1, message: '请指定日期范围' };
  }

  let assignWhere = {
    date: _.gte(startDate).and(_.lte(endDate))
  };
  let checkWhere = {
    date: _.gte(startDate).and(_.lte(endDate))
  };

  if (userId) {
    assignWhere.userId = userId;
    checkWhere.userId = userId;
  }

  // 查询排班打卡记录
  const [assignmentRes, checkRes] = await Promise.all([
    db.collection('assignments').where(assignWhere).orderBy('date', 'asc').get(),
    db.collection('checkRecords').where(checkWhere).orderBy('date', 'asc').get().catch(() => ({ data: [] }))
  ]);

  const assignments = assignmentRes.data;
  const checkRecords = checkRes.data || [];

  if (assignments.length === 0 && checkRecords.length === 0) {
    return { code: -1, message: '该时间段内没有打卡记录' };
  }

  // 获取用户信息
  const allUserIds = [...new Set([
    ...assignments.map(a => a.userId),
    ...checkRecords.map(c => c.userId)
  ])];

  const userRes = await db.collection('users').where({
    _id: _.in(allUserIds)
  }).get();

  const userMap = {};
  userRes.data.forEach(u => userMap[u._id] = u);

  // 创建工作簿
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('打卡记录');

  // 设置表头
  worksheet.columns = [
    { header: '日期', key: 'date', width: 15 },
    { header: '人员', key: 'userName', width: 15 },
    { header: '部门', key: 'department', width: 15 },
    { header: '记录类型', key: 'recordType', width: 12 },
    { header: '签到时间', key: 'checkInTime', width: 20 },
    { header: '签退时间', key: 'checkOutTime', width: 20 },
    { header: '工时(小时)', key: 'workHours', width: 12 },
    { header: '状态', key: 'status', width: 12 },
    { header: '迟到/早退', key: 'lateEarly', width: 15 }
  ];

  // 设置表头样式
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF07C160' }
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // 状态映射
  const statusMap = {
    'pending': '待签到',
    'checked_in': '值班中',
    'checked_out': '已完成',
    'absent': '缺勤'
  };

  // 合并记录
  const allRecords = [
    ...assignments.map(a => ({ ...a, type: '排班打卡' })),
    ...checkRecords.map(c => ({ ...c, type: '自由打卡' }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  // 添加数据
  allRecords.forEach(item => {
    const user = userMap[item.userId] || {};
    let lateEarly = '';
    if (item.isLate) lateEarly += '迟到 ';
    if (item.isEarlyLeave) lateEarly += '早退';

    worksheet.addRow({
      date: item.date,
      userName: user.realName || '未知人员',
      department: user.department || '-',
      recordType: item.type,
      checkInTime: item.checkInTime ? formatDateTime(item.checkInTime) : '-',
      checkOutTime: item.checkOutTime ? formatDateTime(item.checkOutTime) : '-',
      workHours: item.workHours ? Math.round(item.workHours * 100) / 100 : '-',
      status: statusMap[item.status] || item.status,
      lateEarly: lateEarly || '正常'
    });
  });

  // 添加边框
  worksheet.eachRow(row => {
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // 生成文件并上传
  const filename = userId 
    ? `打卡记录_${userMap[userId]?.realName || userId}_${startDate}_${endDate}.xlsx`
    : `打卡记录_${startDate}_${endDate}.xlsx`;
  
  return await uploadWorkbook(workbook, filename);
}

/**
 * 导出统计数据
 */
async function exportStatistics(month) {
  if (!month) {
    return { code: -1, message: '请指定月份' };
  }

  const [year, mon] = month.split('-');
  const start = `${month}-01`;
  const end = `${month}-${new Date(year, mon, 0).getDate()}`;

  // 聚合查询统计数据
  const statsRes = await db.collection('assignments')
    .aggregate()
    .match({
      date: _.gte(start).and(_.lte(end))
    })
    .group({
      _id: '$userId',
      totalShifts: $.sum(1),
      completedShifts: $.sum($.cond({
        if: $.eq(['$status', 'checked_out']),
        then: 1,
        else: 0
      })),
      totalWorkHours: $.sum($.cond({
        if: $.eq(['$status', 'checked_out']),
        then: '$workHours',
        else: 0
      })),
      lateCount: $.sum($.cond({
        if: '$isLate',
        then: 1,
        else: 0
      }))
    })
    .end();

  // 获取自由打卡统计
  let freeCheckStats = [];
  try {
    const freeRes = await db.collection('checkRecords')
      .aggregate()
      .match({
        date: _.gte(start).and(_.lte(end))
      })
      .group({
        _id: '$userId',
        freeCheckCount: $.sum(1),
        freeWorkHours: $.sum($.cond({
          if: $.eq(['$status', 'checked_out']),
          then: '$workHours',
          else: 0
        })),
        freeLateCount: $.sum($.cond({
          if: '$isLate',
          then: 1,
          else: 0
        }))
      })
      .end();
    freeCheckStats = freeRes.list || [];
  } catch (err) {
    console.log('查询自由打卡统计失败:', err);
  }

  const stats = statsRes.list || [];
  
  if (stats.length === 0 && freeCheckStats.length === 0) {
    return { code: -1, message: '该月份没有统计数据' };
  }

  // 合并统计数据
  const statsMap = {};
  stats.forEach(s => {
    statsMap[s._id] = {
      userId: s._id,
      totalShifts: s.totalShifts || 0,
      completedShifts: s.completedShifts || 0,
      totalWorkHours: s.totalWorkHours || 0,
      lateCount: s.lateCount || 0
    };
  });

  freeCheckStats.forEach(f => {
    if (statsMap[f._id]) {
      statsMap[f._id].completedShifts += (f.freeCheckCount || 0);
      statsMap[f._id].totalWorkHours += (f.freeWorkHours || 0);
      statsMap[f._id].lateCount += (f.freeLateCount || 0);
    } else {
      statsMap[f._id] = {
        userId: f._id,
        totalShifts: 0,
        completedShifts: f.freeCheckCount || 0,
        totalWorkHours: f.freeWorkHours || 0,
        lateCount: f.freeLateCount || 0
      };
    }
  });

  const allStats = Object.values(statsMap);

  // 获取用户信息
  const userIds = allStats.map(s => s.userId);
  const userRes = await db.collection('users').where({
    _id: _.in(userIds)
  }).get();

  const userMap = {};
  userRes.data.forEach(u => userMap[u._id] = u);

  // 创建工作簿
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('统计数据');

  // 设置表头
  worksheet.columns = [
    { header: '人员', key: 'userName', width: 15 },
    { header: '部门', key: 'department', width: 15 },
    { header: '排班次数', key: 'totalShifts', width: 12 },
    { header: '已完成', key: 'completedShifts', width: 12 },
    { header: '完成率', key: 'completionRate', width: 12 },
    { header: '总工时(小时)', key: 'totalWorkHours', width: 14 },
    { header: '迟到次数', key: 'lateCount', width: 12 }
  ];

  // 设置表头样式
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF07C160' }
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // 添加数据
  allStats.forEach(item => {
    const user = userMap[item.userId] || {};
    const completionRate = item.totalShifts > 0 
      ? Math.round(item.completedShifts / item.totalShifts * 100) 
      : 100;

    worksheet.addRow({
      userName: user.realName || '未知人员',
      department: user.department || '-',
      totalShifts: item.totalShifts,
      completedShifts: item.completedShifts,
      completionRate: `${completionRate}%`,
      totalWorkHours: Math.round(item.totalWorkHours * 100) / 100,
      lateCount: item.lateCount
    });
  });

  // 添加汇总行
  const totalRow = worksheet.addRow({
    userName: '合计',
    department: '-',
    totalShifts: allStats.reduce((sum, s) => sum + s.totalShifts, 0),
    completedShifts: allStats.reduce((sum, s) => sum + s.completedShifts, 0),
    completionRate: '-',
    totalWorkHours: Math.round(allStats.reduce((sum, s) => sum + s.totalWorkHours, 0) * 100) / 100,
    lateCount: allStats.reduce((sum, s) => sum + s.lateCount, 0)
  });
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF5F5F5' }
  };

  // 添加边框
  worksheet.eachRow(row => {
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // 生成文件并上传
  return await uploadWorkbook(workbook, `统计数据_${month}.xlsx`);
}

/**
 * 上传工作簿到云存储
 */
async function uploadWorkbook(workbook, filename) {
  // 生成Excel文件Buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // 上传到云存储
  const cloudPath = `exports/${Date.now()}_${filename}`;
  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer
  });

  // 获取临时下载链接
  const tempUrlRes = await cloud.getTempFileURL({
    fileList: [uploadRes.fileID]
  });

  return {
    code: 0,
    data: {
      fileID: uploadRes.fileID,
      tempFileURL: tempUrlRes.fileList[0].tempFileURL,
      filename
    }
  };
}

/**
 * 格式化日期时间
 */
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
