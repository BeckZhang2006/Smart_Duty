import Toast from '@vant/weapp/toast/toast';
import Dialog from '@vant/weapp/dialog/dialog';

const app = getApp();

Page({
  data: {
    activeTab: 'pending',
    pendingList: [],
    processedList: [],
    loading: false,
    showRejectDialog: false,
    rejectRemark: '',
    currentSwapId: null
  },

  onLoad() {
    this.loadSwaps();
  },

  onShow() {
    this.loadSwaps();
  },

  onTabChange(e) {
    this.setData({ activeTab: e.detail.name });
  },

  async loadSwaps() {
    this.setData({ loading: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'swapShift',
        data: { action: 'list', type: 'all' }
      });
      
      if (res.result.code === 0) {
        const all = res.result.data;
        const pending = all.filter(s => s.status === 'pending');
        const processed = all.filter(s => s.status !== 'pending');
        
        this.setData({
          pendingList: pending,
          processedList: processed
        });
      }
    } catch (err) {
      console.error('加载换班列表失败:', err);
      Toast.fail('加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  async approveSwap(e) {
    const { id } = e.currentTarget.dataset;
    
    Dialog.confirm({
      title: '确认同意',
      message: '确定同意这个换班申请吗？'
    }).then(async () => {
      try {
        Toast.loading({ message: '处理中...', forbidClick: true });
        
        const res = await wx.cloud.callFunction({
          name: 'swapShift',
          data: { action: 'approve', swapId: id }
        });
        
        Toast.clear();
        
        if (res.result.code === 0) {
          Toast.success('已同意');
          this.loadSwaps();
        } else {
          Toast.fail(res.result.message || '操作失败');
        }
      } catch (err) {
        Toast.clear();
        Toast.fail('操作失败');
      }
    }).catch(() => {});
  },

  rejectSwap(e) {
    const { id } = e.currentTarget.dataset;
    this.setData({
      showRejectDialog: true,
      currentSwapId: id,
      rejectRemark: ''
    });
  },

  onRejectRemarkChange(e) {
    this.setData({ rejectRemark: e.detail });
  },

  cancelReject() {
    this.setData({ showRejectDialog: false });
  },

  async confirmReject() {
    const { currentSwapId, rejectRemark } = this.data;
    
    try {
      Toast.loading({ message: '处理中...', forbidClick: true });
      
      const res = await wx.cloud.callFunction({
        name: 'swapShift',
        data: { 
          action: 'reject', 
          swapId: currentSwapId,
          remark: rejectRemark
        }
      });
      
      Toast.clear();
      
      if (res.result.code === 0) {
        Toast.success('已拒绝');
        this.setData({ showRejectDialog: false });
        this.loadSwaps();
      } else {
        Toast.fail(res.result.message || '操作失败');
      }
    } catch (err) {
      Toast.clear();
      Toast.fail('操作失败');
    }
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  getStatusType(status) {
    const map = {
      'approved': 'success',
      'rejected': 'danger',
      'cancelled': 'default'
    };
    return map[status] || 'default';
  },

  getStatusText(status) {
    const map = {
      'approved': '已通过',
      'rejected': '已拒绝',
      'cancelled': '已取消'
    };
    return map[status] || '未知';
  }
});
