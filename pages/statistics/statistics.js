import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    currentMonth: '',
    currentMonthIndex: 0,
    monthColumns: [],
    showMonthPicker: false,
    statsType: 'personal', // personal / team
    isAdmin: false,
    activeTab: 'trend',
    summary: {},
    dailyStats: [],
    teamStats: [],
    chart: null
  },

  onLoad() {
    // 检查登录状态
    app.checkLoginStatus().then(isLoggedIn => {
      if (!isLoggedIn) return;
      
      // 生成月份选择器数据（最近12个月）
      const months = [];
      const now = new Date();
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}年${d.getMonth() + 1}月`);
      }
      
      this.setData({
        monthColumns: months,
        currentMonth: months[0],
        currentMonthIndex: 0,
        isAdmin: app.globalData.isAdmin
      });
      
      this.loadStatistics();
    });
  },

  // 加载统计数据
  async loadStatistics() {
    wx.showLoading({ title: '加载中' });
    
    try {
      const monthStr = this.data.currentMonth.replace(/[年月]/g, '-').replace(/-$/, '');
      
      const res = await wx.cloud.callFunction({
        name: 'getStatistics',
        data: {
          type: this.data.statsType,
          month: monthStr
        }
      });
      
      if (res.result.code === 0) {
        const data = res.result.data;
        
        if (this.data.statsType === 'personal') {
          this.setData({
            summary: data.summary,
            dailyStats: data.dailyStats || []
          });
        } else {
          this.setData({
            summary: {
              totalMembers: data.totalMembers,
              totalWorkHours: data.totalHours,
              averageHours: data.avgHours
            },
            teamStats: data.memberStats || []
          });
        }
        
        this.drawChart();
      }
    } catch (err) {
      console.error('加载统计失败:', err);
      Toast('加载失败');
    } finally {
      wx.hideLoading();
    }
  },

  // 绘制图表
  drawChart() {
    if (this.data.activeTab === 'trend') {
      this.drawTrendChart();
    } else {
      this.drawPieChart();
    }
  },

  // 趋势图
  drawTrendChart() {
    const query = wx.createSelectorQuery();
    query.select('#trendChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        
        const width = res[0].width;
        const height = res[0].height;
        
        // 清空画布
        ctx.clearRect(0, 0, width, height);
        
        // 数据
        const data = this.data.statsType === 'personal' 
          ? this.data.dailyStats.slice(0, 30)
          : this.data.teamStats.slice(0, 10);
        
        if (data.length === 0) return;
        
        const padding = 40;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        
        const maxValue = Math.max(...data.map(d => d.hours || d.totalWorkHours || 0));
        const stepX = chartWidth / (data.length - 1 || 1);
        
        // 绘制坐标轴
        ctx.strokeStyle = '#e5e5e5';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // 绘制折线
        ctx.strokeStyle = '#07c160';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        data.forEach((item, index) => {
          const x = padding + index * stepX;
          const value = item.hours || item.totalWorkHours || 0;
          const y = height - padding - (value / (maxValue || 1)) * chartHeight;
          
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          
          // 绘制数据点
          ctx.fillStyle = '#07c160';
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
        
        ctx.stroke();
      });
  },

  // 饼图
  drawPieChart() {
    const query = wx.createSelectorQuery();
    query.select('#pieChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        
        const width = res[0].width;
        const height = res[0].height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 3;
        
        ctx.clearRect(0, 0, width, height);
        
        // 数据 - 按状态统计
        const statusData = [
          { label: '已完成', value: this.data.summary.completedShifts || 0, color: '#07c160' },
          { label: '待签到', value: (this.data.summary.totalShifts || 0) - (this.data.summary.completedShifts || 0), color: '#ff9500' }
        ];
        
        const total = statusData.reduce((sum, d) => sum + d.value, 0);
        if (total === 0) return;
        
        let startAngle = -Math.PI / 2;
        
        statusData.forEach(item => {
          if (item.value === 0) return;
          
          const angle = (item.value / total) * Math.PI * 2;
          
          ctx.fillStyle = item.color;
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
          ctx.closePath();
          ctx.fill();
          
          startAngle += angle;
        });
        
        // 中心圆
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        // 中心文字
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('总班次', centerX, centerY - 10);
        ctx.font = '20px sans-serif';
        ctx.fillText(String(total), centerX, centerY + 20);
      });
  },

  // 切换统计类型
  toggleType() {
    if (!this.data.isAdmin) return;
    
    const newType = this.data.statsType === 'personal' ? 'team' : 'personal';
    this.setData({ statsType: newType });
    this.loadStatistics();
  },

  // Tab切换
  onTabChange(e) {
    this.setData({ activeTab: e.detail.name });
    setTimeout(() => this.drawChart(), 100);
  },

  // 月份选择
  showMonthPicker() {
    this.setData({ showMonthPicker: true });
  },

  hideMonthPicker() {
    this.setData({ showMonthPicker: false });
  },

  onMonthConfirm(e) {
    this.setData({
      currentMonth: e.detail.value,
      currentMonthIndex: e.detail.index,
      showMonthPicker: false
    });
    this.loadStatistics();
  }
});
