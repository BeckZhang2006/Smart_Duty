const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * GPS打卡验证
 * @param {String} assignmentId 排班ID（可选，无排班时为空）
 * @param {String} type 类型：check_in / check_out
 * @param {Object} location 位置信息 {latitude, longitude}
 * @param {String} photoUrl 照片URL
 * @param {String} remark 备注
 */
exports.main = async (event, context) => {
  const { assignmentId, type, location, photoUrl, remark } = event;
  const { OPENID } = cloud.getWXContext();
  
  if (!type || !location) {
    return { code: -1, message: '参数不完整' };
  }
  
  try {
    // 获取当前用户信息
    const userRes = await db.collection('users').where({ _openid: OPENID }).get();
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' };
    }
    const user = userRes.data[0];
    
    // 固定打卡坐标（与前端一致）
    const referenceLocation = {
      latitude: 36.67787272135417,
      longitude: 116.97408718532986
    };
    const maxRadius = 500; // 默认500米
    
    // 计算距离
    const distance = calculateDistance(
      location.latitude, location.longitude,
      referenceLocation.latitude, referenceLocation.longitude
    );
    
    if (distance > maxRadius) {
      return {
        code: -1,
        message: `您当前距离打卡位置 ${Math.round(distance)} 米，超出允许范围 ${maxRadius} 米`,
        data: { distance, maxRadius }
      };
    }
    
    // 判断迟到/早退 - 获取班次实际时间
    const now = new Date();
    const currentTime = formatTime(now);
    
    let isLate = false;
    let isEarlyLeave = false;
    let workHours = 0;
    
    const today = formatDate(now);
    
    // 获取排班和班次信息以判断迟到/早退
    let shiftStartTime = null;
    let shiftEndTime = null;
    let gracePeriodMinutes = 5; // 默认5分钟宽限
    
    if (assignmentId) {
      try {
        const assignmentRes = await db.collection('assignments').doc(assignmentId).get();
        if (assignmentRes.data) {
          const assignment = assignmentRes.data;
          // 获取班次信息
          if (assignment.shiftId) {
            const shiftRes = await db.collection('shifts').doc(assignment.shiftId).get();
            if (shiftRes.data) {
              shiftStartTime = shiftRes.data.startTime; // 格式: "HH:mm"
              shiftEndTime = shiftRes.data.endTime;
              // 如果班次设置了宽限时间，使用班次的设置
              if (shiftRes.data.gracePeriod !== undefined) {
                gracePeriodMinutes = shiftRes.data.gracePeriod;
              }
            }
          }
        }
      } catch (err) {
        console.log('获取排班/班次信息失败:', err);
        // 继续执行，使用默认值
      }
    }
    
    if (type === 'check_in') {
      // 签到 - 有排班时才判断是否迟到
      if (assignmentId && shiftStartTime) {
        const scheduledStart = new Date(`${today} ${shiftStartTime}`);
        const gracePeriod = gracePeriodMinutes * 60 * 1000; // 转换为毫秒
        if (now > new Date(scheduledStart.getTime() + gracePeriod)) {
          isLate = true;
        }
      }
      
      // 每次签到都创建新记录，不覆盖之前的
      const newRecord = {
        userId: user._id,
        userName: user.realName || user.nickName || '',
        date: today,
        checkInTime: db.serverDate(),
        checkInLocation: location,
        checkInPhoto: photoUrl,
        checkInDistance: Math.round(distance),
        remark: remark || '',
        isLate,
        status: 'checked_in',
        assignmentId: assignmentId || null, // 关联排班（如果有）
        shiftStartTime: shiftStartTime, // 记录班次时间
        shiftEndTime: shiftEndTime,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      };
      await db.collection('checkRecords').add({ data: newRecord });
      
    } else if (type === 'check_out') {
      // 签退 - 有排班时才判断是否早退
      if (assignmentId && shiftEndTime) {
        const scheduledEnd = new Date(`${today} ${shiftEndTime}`);
        // 早退判断：在班次结束前5分钟签退视为早退
        const earlyLeaveThreshold = 5 * 60 * 1000;
        if (now < new Date(scheduledEnd.getTime() - earlyLeaveThreshold)) {
          isEarlyLeave = true;
        }
      }
      
      // 查找今天最新的、未签退的记录
      let checkRecord = null;
      try {
        const checkRecordRes = await db.collection('checkRecords').where({
          userId: user._id,
          date: today,
          status: 'checked_in'
        }).orderBy('checkInTime', 'desc').limit(1).get();
        checkRecord = checkRecordRes.data[0];
      } catch (err) {
        // 集合不存在时忽略
        if (err.errCode !== -502005) {
          console.log('查询打卡记录失败:', err);
        }
      }
      
      // 计算工时
      if (checkRecord && checkRecord.checkInTime) {
        const checkIn = new Date(checkRecord.checkInTime);
        workHours = (now - checkIn) / (1000 * 60 * 60); // 小时
      }
      
      if (checkRecord) {
        // 更新已有记录
        await db.collection('checkRecords').doc(checkRecord._id).update({
          data: {
            checkOutTime: db.serverDate(),
            checkOutLocation: location,
            checkOutPhoto: photoUrl || '',
            checkOutDistance: Math.round(distance),
            workHours: Math.round(workHours * 100) / 100,
            isEarlyLeave,
            status: 'checked_out',
            updateTime: db.serverDate()
          }
        });
      } else {
        // 直接签退（无签到记录）
        const newRecord = {
          userId: user._id,
          userName: user.realName || user.nickName || '',
          date: today,
          checkOutTime: db.serverDate(),
          checkOutLocation: location,
          checkOutPhoto: photoUrl || '',
          checkOutDistance: Math.round(distance),
          workHours: 0,
          isEarlyLeave,
          status: 'checked_out',
          assignmentId: assignmentId || null,
          shiftStartTime: shiftStartTime,
          shiftEndTime: shiftEndTime,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        };
        await db.collection('checkRecords').add({ data: newRecord });
      }
    }
    
    // 如果有排班ID，同时更新排班表的打卡状态
    if (assignmentId) {
      try {
        const assignmentRes = await db.collection('assignments').doc(assignmentId).get();
        if (assignmentRes.data) {
          const assignment = assignmentRes.data;
          
          if (type === 'check_in') {
            await db.collection('assignments').doc(assignmentId).update({
              data: {
                status: 'checked_in',
                checkInTime: db.serverDate(),
                checkInLocation: location,
                checkInPhoto: photoUrl,
                isLate,
                remarks: remark || ''
              }
            });
          } else {
            let workHrs = 0;
            if (assignment.checkInTime) {
              workHrs = (now - new Date(assignment.checkInTime)) / (1000 * 60 * 60);
            }
            await db.collection('assignments').doc(assignmentId).update({
              data: {
                status: 'checked_out',
                checkOutTime: db.serverDate(),
                checkOutLocation: location,
                checkOutPhoto: photoUrl || '',
                workHours: Math.round(workHrs * 100) / 100,
                isEarlyLeave,
                remarks: remark || ''
              }
            });
          }
        }
      } catch (err) {
        console.log('更新排班表失败（可能排班不存在）:', err);
        // 不影响主流程，继续返回成功
      }
    }
    
    return {
      code: 0,
      message: type === 'check_in' ? '签到成功' : '签退成功',
      data: {
        distance: Math.round(distance),
        isLate,
        isEarlyLeave,
        workHours: Math.round(workHours * 100) / 100
      }
    };
    
  } catch (err) {
    console.error('打卡失败:', err);
    return { code: -1, message: err.message || '打卡失败' };
  }
};

// 计算两点距离（米）
function calculateDistance(lat1, lng1, lat2, lng2) {
  const radLat1 = lat1 * Math.PI / 180.0;
  const radLat2 = lat2 * Math.PI / 180.0;
  const a = radLat1 - radLat2;
  const b = lng1 * Math.PI / 180.0 - lng2 * Math.PI / 180.0;
  let s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a / 2), 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)));
  s = s * 6378.137;
  s = Math.round(s * 10000) / 10;
  return s;
}

function formatTime(date) {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
