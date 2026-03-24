import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    users: [],
    filteredUsers: [],
    searchKeyword: '',
    stats: {
      total: 0,
      admin: 0,
      staff: 0
    },
    loading: false
  },

  onLoad() {
    this.loadUsers();
  },

  onShow() {
    this.loadUsers();
  },

  async loadUsers() {
    this.setData({ loading: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUsers',
        data: {}
      });
      
      if (res.result.code === 0) {
        const users = res.result.data;
        const stats = {
          total: users.length,
          admin: users.filter(u => u.role === 'admin').length,
          staff: users.filter(u => u.role !== 'admin').length
        };
        
        this.setData({
          users,
          filteredUsers: users,
          stats
        });
      }
    } catch (err) {
      console.error('加载人员失败:', err);
      Toast.fail('加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  onSearchChange(e) {
    const keyword = e.detail;
    this.setData({ searchKeyword: keyword });
    this.filterUsers(keyword);
  },

  onSearch(e) {
    this.filterUsers(e.detail);
  },

  filterUsers(keyword) {
    const { users } = this.data;
    if (!keyword) {
      this.setData({ filteredUsers: users });
      return;
    }
    
    const filtered = users.filter(u => 
      (u.realName && u.realName.includes(keyword)) ||
      (u.department && u.department.includes(keyword))
    );
    this.setData({ filteredUsers: filtered });
  },

  editUser(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/user-edit?id=${id}`
    });
  }
});
