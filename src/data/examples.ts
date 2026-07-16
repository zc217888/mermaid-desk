// 内置示例图表集合 —— 覆盖最常用的 Mermaid 图类型
export interface Example {
  id: string;
  name: string;
  category: 'flow' | 'sequence' | 'class' | 'state' | 'er' | 'gantt' | 'pie' | 'journey' | 'git' | 'mindmap';
  code: string;
}

export const examples: Example[] = [
  {
    id: 'flow-basic',
    name: '流程图 · 基础',
    category: 'flow',
    code: `flowchart LR
  A[用户访问] --> B{是否登录}
  B -- 是 --> C[加载主页]
  B -- 否 --> D[跳转登录]
  D --> E[输入凭证]
  E --> F{校验通过}
  F -- 是 --> C
  F -- 否 --> G[显示错误]
  G --> D
  C --> H[渲染仪表盘]`,
  },
  {
    id: 'flow-elaborated',
    name: '流程图 · 详细',
    category: 'flow',
    code: `flowchart TB
  subgraph Client["客户端"]
    UI["React UI"]
  end
  subgraph Server["服务端"]
    API["API Gateway"]
    Auth["鉴权服务"]
    DB[("PostgreSQL")]
  end
  UI -->|"HTTPS"| API
  API --> Auth
  Auth --> DB
  API -->|"JSON"| UI`,
  },
  {
    id: 'sequence',
    name: '时序图 · 登录',
    category: 'sequence',
    code: `sequenceDiagram
  participant U as 用户
  participant A as App
  participant S as Server
  U->>A: 输入账号密码
  A->>S: POST /login
  S-->>A: 200 + Token
  A-->>U: 跳转首页
  Note over U,S: Token 存入 localStorage`,
  },
  {
    id: 'class',
    name: '类图 · 订单',
    category: 'class',
    code: `classDiagram
  class Order {
    +id: string
    +total: number
    +status: OrderStatus
    +pay()
    +refund()
  }
  class User {
    +id: string
    +name: string
  }
  class Product {
    +id: string
    +price: number
  }
  Order "1" --> "*" Product : 包含
  User "1" --> "*" Order : 创建`,
  },
  {
    id: 'state',
    name: '状态图 · 订单',
    category: 'state',
    code: `stateDiagram-v2
  [*] --> 待支付
  待支付 --> 已支付 : 支付
  待支付 --> 已取消 : 取消
  已支付 --> 已发货 : 发货
  已发货 --> 已完成 : 签收
  已支付 --> 退款中 : 申请退款
  退款中 --> 已退款 : 审核通过
  已退款 --> [*]
  已完成 --> [*]`,
  },
  {
    id: 'er',
    name: 'ER 图 · 博客',
    category: 'er',
    code: `erDiagram
  USER ||--o{ POST : "创建"
  USER ||--o{ COMMENT : "发表"
  POST ||--o{ COMMENT : "拥有"
  POST }|--|{ TAG : "标记"
  USER {
    int id PK
    string name
    string email
  }
  POST {
    int id PK
    string title
    text content
    int author_id FK
  }`,
  },
  {
    id: 'gantt',
    name: '甘特图 · 项目',
    category: 'gantt',
    code: `gantt
  title 产品发布计划
  dateFormat YYYY-MM-DD
  section 设计
  原型设计 :a1, 2026-07-01, 5d
  视觉设计 :a2, after a1, 4d
  section 开发
  后端 API :b1, 2026-07-08, 8d
  前端页面 :b2, after b1, 6d
  section 上线
  灰度测试 :c1, after b2, 3d
  正式发布 :milestone, after c1, 0d`,
  },
  {
    id: 'pie',
    name: '饼图 · 流量',
    category: 'pie',
    code: `pie title 流量来源
  "搜索引擎" : 42
  "直接访问" : 28
  "社交媒体" : 18
  "广告投放" : 8
  "其他" : 4`,
  },
  {
    id: 'journey',
    name: '用户旅程',
    category: 'journey',
    code: `journey
  title 用户的首次购买旅程
  section 认知
    看见广告: 3: 用户
    访问官网: 4: 用户
  section 决策
    浏览商品: 4: 用户
    加入购物车: 5: 用户
  section 购买
    提交订单: 4: 用户
    完成支付: 5: 用户
  section 售后
    收到货物: 5: 用户
    撰写评价: 3: 用户`,
  },
  {
    id: 'git',
    name: 'Git 分支',
    category: 'git',
    code: `gitGraph
  commit
  commit
  branch develop
  checkout develop
  commit
  commit
  checkout main
  merge develop
  branch feature
  checkout feature
  commit
  commit
  checkout main
  merge feature
  commit`,
  },
  {
    id: 'mindmap',
    name: '思维导图',
    category: 'mindmap',
    code: `mindmap
  root((产品策略))
    增长
      SEO
      投放
      裂变
    体验
      性能
      UI
      流程
    商业化
      订阅
      增值服务
      B 端合作`,
  },
];
