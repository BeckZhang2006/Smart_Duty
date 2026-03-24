import Toast from '@vant/weapp/toast/toast';
import Dialog from '@vant/weapp/dialog/dialog';

const app = getApp();

Page({
  data: {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    currentMonthIndex: new Date().getMonth(),
    monthColumns: [],
    showMonthPicker: false,
    schedules: [],
    stats: {
      total: 0,
      pending: 0,
      completed: 0
    },
    loading: false
  },

  onLoad() {
    this.initMonthColumns();
    this.loadSchedules();
  },

  onShow() {
    this.loadSchedules();
  },

  initMonthColumns() {
    const months = [];
    for (let i = 1; i <= 12; i++) {
      months.push(`${i}月`);
    }
    this.setData({ monthColumns: months });
  },

  async loadSchedules() {
    const { currentYear, currentMonth } = this.data;
    const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    
    this.setData({ loading: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAssignments',
        data: {
          startDate: `${monthStr}-01`,
          endDate: `${monthStr}-31`
        }
      });
      
      if (res.result.code === 0) {
        const schedules = res.result.data.sort((a, b) => b.date.localeCompare(a.date));
        
        // 统计
        const stats = {
          total: schedules.length,
          pending: schedules.filter(s => s.status === 'pending').length,
          completed: schedules.filter(s => s.status === 'checked_out').length
        };
        
        this.setData({ schedules, stats });
      }
    } catch (err) {
      console.error('加载排班失败:', err);
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
    this.loadSchedules();
  },

  goToCreate() {
    wx.navigateTo({
      url: '/pages/admin/schedule-edit/schedule-edit'
    });
  },

  editSchedule(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/schedule-edit/schedule-edit?id=${id}`
    });
  },

  deleteSchedule(e) {
    const { id } = e.currentTarget.dataset;
    
    Dialog.confirm({
      title: '确认删除',
      message: '确定要删除这个排班吗？'
    }).then(async () => {
      try {
        Toast.loading({ message: '删除中...', forbidClick: true });
        
        const db = wx.cloud.database();
        await db.collection('assignments').doc(id).remove();
        
        Toast.clear();
        Toast.success('已删除');
        this.loadSchedules();
      } catch (err) {
        Toast.clear();
        Toast.fail('删除失败');
      }
    }).catch(() => {});
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
