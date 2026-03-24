import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    shifts: [],
    loading: false
  },

  onLoad() {
    this.loadShifts();
  },

  onShow() {
    this.loadShifts();
  },

  async loadShifts() {
    this.setData({ loading: true });
    
    try {
      const db = wx.cloud.database();
      const res = await db.collection('shifts').get();
      
      this.setData({ shifts: res.data });
    } catch (err) {
      console.error('加载班次失败:', err);
      Toast.fail('加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  addShift() {
    wx.navigateTo({
      url: '/pages/admin/shift-edit'
    });
  },

  editShift(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/shift-edit?id=${id}`
    });
  }
});
