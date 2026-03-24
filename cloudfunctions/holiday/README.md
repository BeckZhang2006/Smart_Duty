# 节假日管理云函数

## 数据库集合

需要在云开发控制台创建 `holidays` 集合，并设置以下权限：

### 数据权限设置

```json
{
  "read": true,
  "write": "auth.openid == doc._openid || auth.role == 'admin'"
}
```

或者简单设置为：
- 所有用户可读
- 仅创建者和管理员可写

### 数据结构

```javascript
{
  _id: '',        // 自动生成的ID
  date: '2025-01-01',   // 日期，格式：YYYY-MM-DD
  name: '元旦',         // 节假日名称
  type: 'holiday',      // 类型：holiday(法定节假日)/workday(调休日)/other(其他)
  createTime: Date,     // 创建时间
  updateTime: Date      // 更新时间
}
```

## API 接口

### 1. 查询节假日列表

```javascript
wx.cloud.callFunction({
  name: 'holiday',
  data: {
    action: 'list',
    year: '2025'  // 可选，筛选特定年份
  }
})
```

### 2. 创建节假日

```javascript
wx.cloud.callFunction({
  name: 'holiday',
  data: {
    action: 'create',
    date: '2025-01-01',
    name: '元旦',
    type: 'holiday'  // holiday/workday/other
  }
})
```

### 3. 删除节假日

```javascript
wx.cloud.callFunction({
  name: 'holiday',
  data: {
    action: 'delete',
    id: 'xxx'  // 节假日记录ID
  }
})
```

## 部署说明

1. 在微信开发者工具中，右键点击 `cloudfunctions/holiday` 文件夹
2. 选择 "创建并部署：云端安装依赖"
3. 等待部署完成

## 使用说明

在小程序管理后台页面点击 "节假日设置" 即可进入管理页面。
