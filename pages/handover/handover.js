import Toast from '@vant/weapp/toast/toast';

const app = getApp();

Page({
  data: {
    assignmentId: '',
    assignment: null,
    handover: {
      content: '',
      items: [],
      equipmentStatus: [],
      equipmentRemark: '',
      todos: [],
      remarks: '',
      signature: ''
    },
    showItemDialog: false,
    showTodoDialog: false,
    showSignaturePad: false,
    newItem: { name: '', count: 1 },
    newTodo: '',
    isSubmitting: false,
    ctx: null,
    canvas: null,
    lastX: 0,
    lastY: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    isDrawing: false
  },

  onLoad(options) {
    this.setData({ assignmentId: options.id });
    this.loadAssignment();
  },

  async loadAssignment() {
    try {
      // 加载排班详情
      const today = app.getLocalDateString();
      const res = await wx.cloud.callFunction({
        name: 'getAssignments',
        data: {
          startDate: today,
          endDate: today
        }
      });
      
      if (res.result.code === 0) {
        const assignment = res.result.data.find(a => a._id === this.data.assignmentId);
        this.setData({ assignment });
      }
    } catch (err) {
      console.error('加载排班详情失败:', err);
      Toast('加载排班详情失败');
    }
  },

  onContentChange(e) {
    this.setData({ 'handover.content': e.detail });
  },

  // 物品清单
  addItem() {
    this.setData({ showItemDialog: true, newItem: { name: '', count: 1 } });
  },

  cancelAddItem() {
    this.setData({ showItemDialog: false });
  },

  confirmAddItem() {
    const { newItem, handover } = this.data;
    if (!newItem.name.trim()) {
      Toast('请输入物品名称');
      return;
    }
    
    handover.items.push({ name: newItem.name, count: parseInt(newItem.count) || 1 });
    this.setData({ handover, showItemDialog: false });
  },

  onNewItemNameChange(e) {
    this.setData({ 'newItem.name': e.detail });
  },

  onNewItemCountChange(e) {
    this.setData({ 'newItem.count': e.detail });
  },

  onItemNameChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`handover.items[${index}].name`]: e.detail });
  },

  onItemCountChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`handover.items[${index}].count`]: e.detail });
  },

  deleteItem(e) {
    const index = e.currentTarget.dataset.index;
    const { handover } = this.data;
    handover.items.splice(index, 1);
    this.setData({ handover });
  },

  // 设备状态
  onEquipmentChange(e) {
    this.setData({ 'handover.equipmentStatus': e.detail });
  },

  onEquipmentRemarkChange(e) {
    this.setData({ 'handover.equipmentRemark': e.detail });
  },

  // 待办事项
  addTodo() {
    this.setData({ showTodoDialog: true, newTodo: '' });
  },

  cancelAddTodo() {
    this.setData({ showTodoDialog: false });
  },

  confirmAddTodo() {
    const { newTodo, handover } = this.data;
    if (!newTodo.trim()) {
      Toast('请输入待办事项');
      return;
    }
    
    handover.todos.push({ content: newTodo, done: false });
    this.setData({ handover, showTodoDialog: false });
  },

  onNewTodoChange(e) {
    this.setData({ newTodo: e.detail });
  },

  onTodoDoneChange(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`handover.todos[${index}].done`]: e.detail });
  },

  deleteTodo(e) {
    const index = e.currentTarget.dataset.index;
    const { handover } = this.data;
    handover.todos.splice(index, 1);
    this.setData({ handover });
  },

  onRemarksChange(e) {
    this.setData({ 'handover.remarks': e.detail });
  },

  // 签名
  showSignaturePad() {
    this.setData({ showSignaturePad: true });
    // 延迟初始化，等待弹窗渲染完成
    setTimeout(() => this.initCanvas(), 300);
  },

  hideSignaturePad() {
    this.setData({ showSignaturePad: false });
  },

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#signatureCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) {
          console.error('获取canvas节点失败');
          return;
        }
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const width = res[0].width;
        const height = res[0].height;
        
        // 设置canvas实际尺寸
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        
        // 缩放以适配高清屏
        ctx.scale(dpr, dpr);
        
        // 设置画笔样式
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // 保存画布实际尺寸用于坐标计算
        this.setData({ 
          canvas, 
          ctx,
          canvasWidth: width,
          canvasHeight: height,
          isDrawing: false
        });
        
        console.log('Canvas初始化完成:', width, height, dpr);
      });
  },

  onTouchStart(e) {
    const { ctx, canvasWidth, canvasHeight } = this.data;
    if (!ctx) {
      console.error('Canvas context未初始化');
      return;
    }
    
    const touch = e.touches[0];
    const x = touch.x;
    const y = touch.y;
    
    // 边界检查
    if (x < 0 || x > canvasWidth || y < 0 || y > canvasHeight) {
      return;
    }
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    this.setData({ 
      lastX: x, 
      lastY: y,
      isDrawing: true
    });
  },

  onTouchMove(e) {
    const { ctx, canvasWidth, canvasHeight, isDrawing } = this.data;
    if (!ctx || !isDrawing) return;
    
    const touch = e.touches[0];
    const x = touch.x;
    const y = touch.y;
    
    // 边界检查
    if (x < 0 || x > canvasWidth || y < 0 || y > canvasHeight) {
      return;
    }
    
    ctx.lineTo(x, y);
    ctx.stroke();
    
    this.setData({ lastX: x, lastY: y });
  },

  onTouchEnd() {
    const { ctx } = this.data;
    if (ctx) {
      ctx.closePath();
    }
    this.setData({ isDrawing: false });
  },

  clearSignature() {
    const { ctx, canvasWidth, canvasHeight } = this.data;
    if (ctx) {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
  },

  saveSignature() {
    const { canvas } = this.data;
    if (!canvas) {
      Toast('签名板未初始化，请重试');
      return;
    }
    
    wx.canvasToTempFilePath({
      canvas,
      success: (res) => {
        this.setData({
          'handover.signature': res.tempFilePath,
          showSignaturePad: false
        });
        Toast.success('签名已保存');
      },
      fail: (err) => {
        console.error('保存签名失败:', err);
        Toast('保存签名失败，请重试');
      }
    });
  },

  // 提交
  async submitHandover() {
    const { handover, assignmentId } = this.data;
    
    if (!handover.content.trim()) {
      Toast('请填写值班状况');
      return;
    }
    if (!handover.signature) {
      Toast('请签名确认');
      return;
    }
    
    this.setData({ isSubmitting: true });
    
    try {
      // 上传签名图片
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `handover/${assignmentId}_${Date.now()}.png`,
        filePath: handover.signature
      });
      
      // 保存交接班信息
      const saveRes = await wx.cloud.callFunction({
        name: 'saveHandover',
        data: {
          assignmentId,
          handover: {
            ...handover,
            signature: uploadRes.fileID
          }
        }
      });
      
      if (saveRes.result.code === 0) {
        Toast.success('交接班成功');
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        Toast(saveRes.result.message || '提交失败');
      }
    } catch (err) {
      console.error('提交交接班失败:', err);
      Toast('提交失败');
    } finally {
      this.setData({ isSubmitting: false });
    }
  }
});
