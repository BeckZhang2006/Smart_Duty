import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    records: [],
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    currentMonthIndex: new Date().getMonth(),
    monthColumns: [],
    showMonthPicker: false,
    statusFilter: 'all',
    statusFilterText: '全部状态',
    statusIndex: 0,
    statusColumns: [
      { text: '全部状态', value: 'all' },
      { text: '待打卡', value: 'pending' },
      { text: '已签到', value: 'checked_in' },
      { text: '已完成', value: 'checked_out' }
    ],
    showStatusPicker: false,
    loading: false,
    isAdmin: false
  },

  onLoad() {
    this.initMonthColumns();
    this.checkAdminAndLoad();
  },

  onShow() {
    this.loadRecords();
  },

  initMonthColumns() {
    const months = [];
    for (let i = 1; i <= 12; i++) {
      months.push(`${i}月`);
    }
    this.setData({ monthColumns: months });
  },

  // 检查是否管理员并加载数据
  async checkAdminAndLoad() {
    const isAdmin = app.globalData.isAdmin || false;
    this.setData({ isAdmin });
    this.loadRecords();
  },

  async loadRecords() {
    const { currentYear, currentMonth, statusFilter, isAdmin } = this.data;
    const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    
    this.setData({ loading: true });
    
    try {
      // 使用云函数查询所有打卡记录（管理员可查所有人）
      const res = await wx.cloud.callFunction({
        name: 'getAllCheckRecords',
        data: {
          startDate: `${monthStr}-01`,
          endDate: `${monthStr}-31`,
          isAdmin: isAdmin
        }
      });
      
      if (res.result.code !== 0) {
        Toast.fail(res.result.message || '加载失败');
        return;
      }
      
      let records = res.result.data || [];
      
      // 处理记录显示
      records = records.map(item => {
        const isFree = item.recordType === 'free';
        return {
          ...item,
          displayDate: item.date,
          displayShiftName: isFree ? '自由打卡' : (item.shiftInfo?.name || '未知班次'),
          displayTimeRange: isFree ? '工作时间 09:00 - 18:00' : 
            (item.shiftInfo ? `${item.shiftInfo.startTime} - ${item.shiftInfo.endTime}` : '')
        };
      });
      
      // 按日期倒序，同一天内按时间倒序
      records.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        // 同一天内按创建时间倒序（处理 Date 对象）
        const aTime = a.createTime ? new Date(a.createTime).getTime() : 
                     (a.checkInTime ? new Date(a.checkInTime).getTime() : 0);
        const bTime = b.createTime ? new Date(b.createTime).getTime() : 
                     (b.checkInTime ? new Date(b.checkInTime).getTime() : 0);
        return bTime - aTime;
      });
      
      // 状态筛选
      if (statusFilter !== 'all') {
        records = records.filter(r => r.status === statusFilter);
      }
      
      this.setData({ records });
    } catch (err) {
      console.error('加载记录失败:', err);
      Toast.fail('加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  showMonthPicker() {
    this.setData({ showMonthPicker: true });
  },

  hideMonthPicker() {
    this.setData({ showMonthPicker: false });
  },

  onMonthConfirm(e) {
    const month = e.detail.index + 1;
    this.setData({
      currentMonth: month,
      currentMonthIndex: e.detail.index,
      showMonthPicker: false
    });
    this.loadRecords();
  },

  showStatusFilter() {
    this.setData({ showStatusPicker: true });
  },

  hideStatusPicker() {
    this.setData({ showStatusPicker: false });
  },

  onStatusConfirm(e) {
    const { value, index } = e.detail;
    this.setData({
      statusFilter: value.value,
      statusFilterText: value.text,
      statusIndex: index,
      showStatusPicker: false
    });
    this.loadRecords();
  },

  // 格式化时间（显示年月日时分）
  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  // 预览图片 - 使用 wx.previewImage API
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) {
      Toast('图片地址无效');
      return;
    }
    
    // 收集当前记录中的所有图片URL
    const currentRecord = e.currentTarget.dataset.record;
    let urls = [];
    
    if (currentRecord) {
      // 如果有记录数据，收集该记录的所有图片
      if (currentRecord.checkInPhoto) urls.push(currentRecord.checkInPhoto);
      if (currentRecord.checkOutPhoto && currentRecord.checkOutPhoto !== currentRecord.checkInPhoto) {
        urls.push(currentRecord.checkOutPhoto);
      }
    }
    
    // 如果没有找到记录数据，使用当前点击的图片
    if (urls.length === 0) {
      urls = [url];
    }
    
    wx.previewImage({
      current: url,
      urls: urls,
      fail: () => {
        Toast('图片预览失败');
      }
    });
  },

  getStatusType(status) {
    const map = {
      'pending': 'primary',
      'checked_in': 'warning',
      'checked_out': 'success',
      'swap_pending': 'danger'
    };
    return map[status] || 'default';
  },

  getStatusText(status) {
    const map = {
      'pending': '待打卡',
      'checked_in': '已签到',
      'checked_out': '已完成',
      'swap_pending': '换班中'
    };
    return map[status] || '未知';
  }
});
