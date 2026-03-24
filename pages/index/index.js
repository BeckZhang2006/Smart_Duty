import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    selectedDate: '',
    selectedDuties: [],
    assignments: [],
    currentUser: null,
    isAdmin: false,
    showMonthPicker: false,
    monthColumns: [],
    currentMonthIndex: 0,
    showSwapDialog: false,
    swapForm: {
      assignmentId: '',
      originalShift: '',
      targetUser: '',
      targetUserId: '',
      reason: ''
    }
  },

  onLoad() {
    // 检查登录状态
    app.checkLoginStatus().then(isLoggedIn => {
      if (!isLoggedIn) return;
      
      // 生成月份选择器数据
      const months = [];
      for (let i = 0; i < 12; i++) {
        months.push(`${i + 1}月`);
      }
      this.setData({
        monthColumns: months,
        currentMonthIndex: this.data.currentMonth - 1
      });
      
      // 获取用户信息
      if (app.globalData && app.globalData.userInfo) {
        this.setData({
          currentUser: app.globalData.userInfo,
          isAdmin: app.globalData.isAdmin || false
        });
        this.loadAssignments();
      } else {
        app.userInfoReadyCallback = (data) => {
          if (data && data.userInfo) {
            this.setData({
              currentUser: data.userInfo,
              isAdmin: data.isAdmin || false
            });
            this.loadAssignments();
          }
        };
      }
      
      // 默认选中今天
      this.selectDate({ currentTarget: { dataset: { date: this.formatDate(new Date()) } } });
    });
  },

  onShow() {
    // 刷新数据
    if (this.data.currentUser) {
      this.loadAssignments();
    }
  },

  // 加载排班数据
  async loadAssignments() {
    const { currentYear, currentMonth } = this.data;
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${new Date(currentYear, currentMonth, 0).getDate()}`;
    
    wx.showLoading({ title: '加载中' });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAssignments',
        data: {
          startDate,
          endDate
        }
      });
      
      if (res.result.code === 0) {
        this.setData({
          assignments: res.result.data
        });
        this.generateCalendar();
      }
    } catch (err) {
      console.error('加载排班失败:', err);
      Toast('加载排班失败');
    } finally {
      wx.hideLoading();
    }
  },

  // 生成日历
  generateCalendar() {
    const { currentYear, currentMonth, assignments } = this.data;
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const startWeekDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    const days = [];
    const today = this.formatDate(new Date());
    
    // 上月日期
    const prevMonthLastDay = new Date(currentYear, currentMonth - 1, 0).getDate();
    const prevMonth = new Date(currentYear, currentMonth - 2, 1);
    const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    for (let i = startWeekDay - 1; i >= 0; i--) {
      days.push({
        date: `${prevMonthStr}-${String(prevMonthLastDay - i).padStart(2, '0')}`,
        day: prevMonthLastDay - i,
        isCurrentMonth: false
      });
    }
    
    // 当月日期
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const dayDuties = assignments.filter(a => a.date === date);
      
      days.push({
        date,
        day: i,
        isCurrentMonth: true,
        isToday: date === today,
        isSelected: date === this.data.selectedDate,
        hasDuty: dayDuties.length > 0,
        duties: dayDuties.map(d => ({
          shiftColor: this.getShiftColorClass(d.shiftInfo?.color)
        }))
      });
    }
    
    // 下月日期
    const remainingDays = 42 - days.length;
    const nextMonth = new Date(currentYear, currentMonth, 1);
    const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: `${nextMonthStr}-${String(i).padStart(2, '0')}`,
        day: i,
        isCurrentMonth: false
      });
    }
    
    this.setData({ calendarDays: days });
  },

  // 选中日期
  selectDate(e) {
    const date = e.currentTarget.dataset.date;
    const selectedDuties = this.data.assignments.filter(a => a.date === date);
    
    // 更新选中状态
    const calendarDays = this.data.calendarDays.map(d => ({
      ...d,
      isSelected: d.date === date
    }));
    
    this.setData({
      selectedDate: date,
      selectedDuties,
      calendarDays
    });
  },

  // 显示月份选择器
  showMonthPicker() {
    this.setData({ showMonthPicker: true });
  },

  hideMonthPicker() {
    this.setData({ showMonthPicker: false });
  },

  onMonthConfirm(e) {
    const monthIndex = e.detail.index;
    this.setData({
      currentMonth: monthIndex + 1,
      showMonthPicker: false,
      currentMonthIndex: monthIndex
    });
    this.loadAssignments();
  },

  // 回到今天
  goToToday() {
    const now = new Date();
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      currentMonthIndex: now.getMonth()
    });
    this.loadAssignments();
    this.selectDate({ currentTarget: { dataset: { date: this.formatDate(now) } } });
  },

  // 获取状态样式
  getStatusType(status) {
    const map = {
      'pending': 'warning',
      'checked_in': 'primary',
      'checked_out': 'success',
      'absent': 'danger',
      'swap_pending': 'default'
    };
    return map[status] || 'default';
  },

  getStatusText(status) {
    const map = {
      'pending': '待签到',
      'checked_in': '值班中',
      'checked_out': '已完成',
      'absent': '缺勤',
      'swap_pending': '换班中'
    };
    return map[status] || status;
  },

  getShiftColorClass(color) {
    const map = {
      '#ff9500': 'shift-morning',
      '#1890ff': 'shift-afternoon',
      '#722ed1': 'shift-night',
      '#52c41a': 'shift-overday'
    };
    return map[color] || '';
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 编辑排班 - 跳转到排班管理页面
  editSchedule() {
    if (!this.data.isAdmin) {
      Toast('只有管理员可以编辑排班');
      return;
    }
    
    const { selectedDate } = this.data;
    if (!selectedDate) {
      Toast('请先选择日期');
      return;
    }
    
    // 跳转到排班管理页面，并传递日期参数
    wx.navigateTo({
      url: `/pages/admin/schedule?date=${selectedDate}`
    });
  },

  // 页面跳转
  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/schedule/schedule?id=${id}`
    });
  },

  goToCheckIn(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/checkin/checkin?id=${id}&type=checkin`
    });
  },

  goToCheckOut(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/checkin/checkin?id=${id}&type=checkout`
    });
  },

  goToRecords() {
    wx.navigateTo({ url: '/pages/records/records' });
  },

  goToSwaps() {
    wx.navigateTo({ url: '/pages/swap/swap' });
  },

  goToStatistics() {
    wx.switchTab({ url: '/pages/statistics/statistics' });
  },

  goToAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' });
  },

  // 申请换班
  applySwap(e) {
    const id = e.currentTarget.dataset.id;
    const assignment = this.data.selectedDuties.find(d => d._id === id);
    
    this.setData({
      showSwapDialog: true,
      'swapForm.assignmentId': id,
      'swapForm.originalShift': `${assignment.shiftInfo?.name} (${assignment.date})`
    });
  },

  cancelSwap() {
    this.setData({
      showSwapDialog: false,
      swapForm: { assignmentId: '', originalShift: '', targetUser: '', targetUserId: '', reason: '' }
    });
  },

  // 选择目标人员
  async selectTargetUser() {
    wx.showLoading({ title: '加载中' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUsers',
        data: { 
          action: 'list',
          excludeCurrentUser: true  // 排除当前用户
        }
      });
      
      if (res.result.code === 0) {
        const users = res.result.data;
        if (users.length === 0) {
          Toast('暂无其他人员可选');
          wx.hideLoading();
          return;
        }
        
        const userNames = users.map(u => `${u.realName || u.nickName || '未命名'}${u.department ? ' (' + u.department + ')' : ''}`);
        wx.hideLoading();
        
        wx.showActionSheet({
          itemList: userNames,
          success: (res) => {
            const selectedUser = users[res.tapIndex];
            this.setData({
              'swapForm.targetUser': selectedUser.realName || selectedUser.nickName,
              'swapForm.targetUserId': selectedUser._id
            });
          },
          fail: (err) => {
            // 用户取消选择
            console.log('取消选择:', err);
          }
        });
      } else {
        wx.hideLoading();
        Toast(res.result.message || '加载用户失败');
      }
    } catch (err) {
      console.error('加载用户失败:', err);
      wx.hideLoading();
      Toast('加载用户失败');
    }
  },

  // 换班理由变化
  onReasonChange(e) {
    this.setData({
      'swapForm.reason': e.detail
    });
  },

  async submitSwap() {
    const { swapForm } = this.data;
    
    if (!swapForm.targetUserId) {
      Toast('请选择目标人员');
      return;
    }
    if (!swapForm.reason.trim()) {
      Toast('请输入换班理由');
      return;
    }
    
    wx.showLoading({ title: '提交中' });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'swapShift',
        data: {
          action: 'apply',
          fromAssignmentId: swapForm.assignmentId,
          toUserId: swapForm.targetUserId,
          reason: swapForm.reason
        }
      });
      
      if (res.result.code === 0) {
        Toast.success('申请已提交');
        this.cancelSwap();
        this.loadAssignments();
      } else {
        Toast(res.result.message);
      }
    } catch (err) {
      Toast('提交失败');
    } finally {
      wx.hideLoading();
    }
  }
});
