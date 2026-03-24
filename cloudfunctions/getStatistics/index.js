const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

/**
 * 工时统计
 * @param {String} type 统计类型：personal / team / monthly
 * @param {String} userId 用户ID（personal类型需要）
 * @param {String} month 月份 YYYY-MM
 * @param {String} startDate 开始日期
 * @param {String} endDate 结束日期
 * @param {Boolean} isAdmin 是否管理员
 */
exports.main = async (event, context) => {
  const { type = 'personal', userId, month, startDate, endDate } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 获取当前用户
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }
    const currentUser = userRes.data[0];
    
    // 从后端验证管理员权限，不信任前端传入的参数
    const isAdmin = currentUser.role === 'admin';
    
    switch (type) {
      case 'personal':
        // 个人统计
        const targetUserId = isAdmin && userId ? userId : currentUser._id;
        return await getPersonalStats(targetUserId, month, startDate, endDate);
        
      case 'team':
        // 团队统计（仅管理员）
        if (!isAdmin) {
          return { code: -1, message: '无权查看团队统计' };
        }
        return await getTeamStats(month, startDate, endDate);
        
      case 'monthly':
        // 月度汇总
        if (!month) {
          return { code: -1, message: '请指定月份' };
        }
        return await getMonthlyStats(month, isAdmin ? null : currentUser._id);
        
      default:
        return { code: -1, message: '未知统计类型' };
    }
    
  } catch (err) {
    console.error('统计失败:', err);
    return { code: -1, message: err.message };
  }
};

// 个人统计
async function getPersonalStats(userId, month, startDate, endDate) {
  let dateFilter = {};
  
  if (month) {
    // 按月份查询
    const [year, mon] = month.split('-');
    const start = `${month}-01`;
    const end = `${month}-${new Date(year, mon, 0).getDate()}`;
    dateFilter = { date: _.gte(start).and(_.lte(end)) };
  } else if (startDate && endDate) {
    dateFilter = { date: _.gte(startDate).and(_.lte(endDate)) };
  }
  
  // 获取排班数据
  const assignmentRes = await db.collection('assignments').where({
    userId,
    ...dateFilter
  }).get();
  
  const assignments = assignmentRes.data;
  
  // 获取自由打卡数据（checkRecords）
  let checkRecords = [];
  try {
    const checkRes = await db.collection('checkRecords').where({
      userId,
      ...dateFilter
    }).get();
    checkRecords = checkRes.data || [];
  } catch (err) {
    // 集合不存在时忽略
    if (err.errCode !== -502005) {
      console.log('查询打卡记录失败:', err);
    }
  }
  
  // 统计指标
  let totalShifts = assignments.length;
  let completedShifts = 0;
  let totalWorkHours = 0;
  let lateCount = 0;
  let earlyLeaveCount = 0;
  let absentCount = 0;
  let swapCount = 0;
  
  // 自由打卡统计
  let freeCheckCount = 0;
  let freeCheckHours = 0;
  
  const dailyStats = {};
  const shiftTypeStats = {};
  
  assignments.forEach(a => {
    // 状态统计
    if (a.status === 'checked_out') {
      completedShifts++;
      totalWorkHours += a.workHours || 0;
    }
    if (a.status === 'absent') absentCount++;
    if (a.isSwapped) swapCount++;
    if (a.isLate) lateCount++;
    if (a.isEarlyLeave) earlyLeaveCount++;
    
    // 按天统计
    if (!dailyStats[a.date]) {
      dailyStats[a.date] = { shifts: 0, hours: 0 };
    }
    dailyStats[a.date].shifts++;
    dailyStats[a.date].hours += a.workHours || 0;
  });
  
  // 统计自由打卡数据
  checkRecords.forEach(c => {
    freeCheckCount++;
    if (c.status === 'checked_out') {
      freeCheckHours += c.workHours || 0;
      // 将自由打卡纳入已完成统计
      completedShifts++;
    }
    if (c.isLate) lateCount++;
    if (c.isEarlyLeave) earlyLeaveCount++;
    
    // 按天统计
    if (!dailyStats[c.date]) {
      dailyStats[c.date] = { shifts: 0, hours: 0 };
    }
    dailyStats[c.date].shifts++;
    dailyStats[c.date].hours += c.workHours || 0;
  });
  
  // 总工时 = 排班工时 + 自由打卡工时
  totalWorkHours += freeCheckHours;
  
  // 获取用户信息
  const userRes = await db.collection('users').doc(userId).get();
  const userInfo = userRes.data;
  
  return {
    code: 0,
    data: {
      userInfo: {
        realName: userInfo.realName,
        avatarUrl: userInfo.avatarUrl,
        department: userInfo.department
      },
      summary: {
        totalShifts,
        completedShifts,
        totalWorkHours: Math.round(totalWorkHours * 100) / 100,
        averageHours: completedShifts > 0 ? Math.round(totalWorkHours / completedShifts * 100) / 100 : 0,
        lateCount,
        earlyLeaveCount,
        absentCount,
        swapCount,
        freeCheckCount,
        freeCheckHours: Math.round(freeCheckHours * 100) / 100
      },
      dailyStats: Object.entries(dailyStats).map(([date, stats]) => ({
        date,
        ...stats
      })).sort((a, b) => a.date.localeCompare(b.date)),
      assignments: assignments.map(a => ({
        date: a.date,
        status: a.status,
        workHours: a.workHours,
        checkInTime: a.checkInTime,
        checkOutTime: a.checkOutTime,
        isLate: a.isLate,
        isEarlyLeave: a.isEarlyLeave
      }))
    }
  };
}

// 团队统计
async function getTeamStats(month, startDate, endDate) {
  let dateFilter = {};
  
  if (month) {
    const [year, mon] = month.split('-');
    const start = `${month}-01`;
    const end = `${month}-${new Date(year, mon, 0).getDate()}`;
    dateFilter = { date: _.gte(start).and(_.lte(end)) };
  } else if (startDate && endDate) {
    dateFilter = { date: _.gte(startDate).and(_.lte(endDate)) };
  }
  
  // 聚合查询 - 排班数据
  const statsRes = await db.collection('assignments')
    .aggregate()
    .match(dateFilter)
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
      })),
      absentCount: $.sum($.cond({
        if: $.eq(['$status', 'absent']),
        then: 1,
        else: 0
      }))
    })
    .end();
  
  // 获取自由打卡数据
  let freeCheckStats = [];
  try {
    const freeRes = await db.collection('checkRecords')
      .aggregate()
      .match(dateFilter)
      .group({
        _id: '$userId',
        freeCheckCount: $.sum(1),
        freeCheckHours: $.sum($.cond({
          if: $.eq(['$status', 'checked_out']),
          then: '$workHours',
          else: 0
        }))
      })
      .end();
    freeCheckStats = freeRes.list || [];
  } catch (err) {
    if (err.errCode !== -502005) {
      console.log('查询自由打卡统计失败:', err);
    }
  }
  
  // 获取用户信息
  const userIds = statsRes.list.map(s => s._id);
  const userRes = await db.collection('users').where({
    _id: _.in(userIds)
  }).get();
  
  const userMap = {};
  userRes.data.forEach(u => userMap[u._id] = u);
  
  // 将自由打卡统计合并到排班统计中
  const freeCheckMap = {};
  freeCheckStats.forEach(f => {
    freeCheckMap[f._id] = f;
  });
  
  const result = statsRes.list.map(s => {
    const freeStats = freeCheckMap[s._id] || { freeCheckCount: 0, freeCheckHours: 0 };
    const totalHours = (s.totalWorkHours || 0) + (freeStats.freeCheckHours || 0);
    
    return {
      userId: s._id,
      realName: userMap[s._id]?.realName || '未知',
      department: userMap[s._id]?.department || '',
      avatarUrl: userMap[s._id]?.avatarUrl || '',
      totalShifts: s.totalShifts,
      completedShifts: s.completedShifts + (freeStats.freeCheckCount || 0),
      completionRate: s.totalShifts > 0 ? Math.round(s.completedShifts / s.totalShifts * 100) : 0,
      totalWorkHours: Math.round(totalHours * 100) / 100,
      freeCheckHours: Math.round((freeStats.freeCheckHours || 0) * 100) / 100,
      lateCount: s.lateCount,
      absentCount: s.absentCount
    };
  });
  
  // 按工时排序
  result.sort((a, b) => b.totalWorkHours - a.totalWorkHours);
  
  return {
    code: 0,
    data: {
      memberStats: result,
      totalMembers: result.length,
      totalHours: Math.round(result.reduce((sum, r) => sum + r.totalWorkHours, 0) * 100) / 100,
      avgHours: result.length > 0 ? Math.round(result.reduce((sum, r) => sum + r.totalWorkHours, 0) / result.length * 100) / 100 : 0
    }
  };
}

// 月度统计
async function getMonthlyStats(month, userId) {
  const [year, mon] = month.split('-');
  const start = `${month}-01`;
  const end = `${month}-${new Date(year, mon, 0).getDate()}`;
  
  let match = { date: _.gte(start).and(_.lte(end)) };
  if (userId) {
    match.userId = userId;
  }
  
  // 按日统计 - 排班数据
  const dailyRes = await db.collection('assignments')
    .aggregate()
    .match(match)
    .group({
      _id: '$date',
      shiftCount: $.sum(1),
      completedCount: $.sum($.cond({
        if: $.eq(['$status', 'checked_out']),
        then: 1,
        else: 0
      })),
      workHours: $.sum($.cond({
        if: $.eq(['$status', 'checked_out']),
        then: '$workHours',
        else: 0
      }))
    })
    .sort({ _id: 1 })
    .end();
  
  // 按日统计 - 自由打卡数据
  let freeCheckDaily = [];
  try {
    const freeRes = await db.collection('checkRecords')
      .aggregate()
      .match(match)
      .group({
        _id: '$date',
        freeCount: $.sum(1),
        freeHours: $.sum($.cond({
          if: $.eq(['$status', 'checked_out']),
          then: '$workHours',
          else: 0
        }))
      })
      .sort({ _id: 1 })
      .end();
    freeCheckDaily = freeRes.list || [];
  } catch (err) {
    if (err.errCode !== -502005) {
      console.log('查询自由打卡月度统计失败:', err);
    }
  }
  
  // 合并排班和自由打卡数据
  const dailyMap = {};
  dailyRes.list.forEach(d => {
    dailyMap[d._id] = {
      date: d._id,
      shiftCount: d.shiftCount || 0,
      completedCount: d.completedCount || 0,
      workHours: d.workHours || 0,
      freeCount: 0,
      freeHours: 0
    };
  });
  
  freeCheckDaily.forEach(f => {
    if (dailyMap[f._id]) {
      dailyMap[f._id].freeCount = f.freeCount || 0;
      dailyMap[f._id].freeHours = f.freeHours || 0;
      dailyMap[f._id].workHours += f.freeHours || 0;
    } else {
      dailyMap[f._id] = {
        date: f._id,
        shiftCount: 0,
        completedCount: 0,
        workHours: f.freeHours || 0,
        freeCount: f.freeCount || 0,
        freeHours: f.freeHours || 0
      };
    }
  });
  
  // 转换为数组并排序
  const mergedDaily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  
  // 按周统计
  const weeklyData = [];
  let currentWeek = [];
  let weekNum = 1;
  
  mergedDaily.forEach((day, index) => {
    currentWeek.push(day);
    if (currentWeek.length === 7 || index === mergedDaily.length - 1) {
      weeklyData.push({
        week: `第${weekNum}周`,
        days: currentWeek.length,
        shifts: currentWeek.reduce((sum, d) => sum + d.shiftCount, 0),
        freeCounts: currentWeek.reduce((sum, d) => sum + d.freeCount, 0),
        hours: Math.round(currentWeek.reduce((sum, d) => sum + d.workHours, 0) * 100) / 100
      });
      currentWeek = [];
      weekNum++;
    }
  });
  
  return {
    code: 0,
    data: {
      month,
      dailyStats: mergedDaily,
      weeklyStats: weeklyData,
      summary: {
        totalDays: mergedDaily.length,
        totalShifts: mergedDaily.reduce((sum, d) => sum + d.shiftCount, 0),
        totalFreeChecks: mergedDaily.reduce((sum, d) => sum + d.freeCount, 0),
        totalHours: Math.round(mergedDaily.reduce((sum, d) => sum + d.workHours, 0) * 100) / 100
      }
    }
  };
}
