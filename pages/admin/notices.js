import Toast from '@vant/weapp/toast/toast';
import Dialog from '@vant/weapp/dialog/dialog';

const app = getApp();

Page({
  data: {
    notices: [],
    loading: false
  },

  onLoad() {
    this.loadNotices();
  },

  onShow() {
    this.loadNotices();
  },

  async loadNotices() {
    this.setData({ loading: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'notice',
        data: { action: 'list', limit: 50 }
      });
      
      if (res.result.code === 0) {
        this.setData({ notices: res.result.data });
      }
    } catch (err) {
      console.error('加载公告失败:', err);
      Toast.fail('加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  addNotice() {
    wx.navigateTo({
      url: '/pages/admin/notice-edit'
    });
  },

  editNotice(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/notice-edit?id=${id}`
    });
  },

  deleteNotice(e) {
    const { id } = e.currentTarget.dataset;
    
    Dialog.confirm({
      title: '确认删除',
      message: '确定要删除这个公告吗？'
    }).then(async () => {
      try {
        Toast.loading({ message: '删除中...', forbidClick: true });
        
        const res = await wx.cloud.callFunction({
          name: 'notice',
          data: { action: 'delete', id }
        });
        
        Toast.clear();
        
        if (res.result.code === 0) {
          Toast.success('已删除');
          this.loadNotices();
        } else {
          Toast.fail('删除失败');
        }
      } catch (err) {
        Toast.clear();
        Toast.fail('删除失败');
      }
    }).catch(() => {});
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  getTypeText(type) {
    const map = {
      'system': '系统公告',
      'schedule': '排班通知',
      'other': '其他'
    };
    return map[type] || '其他';
  }
});
