/* ============================================================
   学习计划 · 初始模板（v1.5.0 起降级为「种子」）
   ------------------------------------------------------------
   ⚠️ 重要：这个文件只在**第一次打开页面**、或者你点「恢复默认计划」时生效。
   之后所有修改都存在浏览器 localStorage 的 plan-data 里，页面上可以自己改：
   加项、改名、删除、改阶段日期、改考试日期、换分组，全都不用改这个文件。

   改这个文件什么时候有用：
     - 你想换一套「出厂设置」，以后新设备/new浏览器打开就是新模板
     - 想给现在的自己恢复白纸一张

   日期一律 'YYYY-MM-DD' 字符串：字典序 = 日期序，比较不用转 Date。

   phases 里 track 只有两种：
     'course' → 课内复习阶段，参与「现在主攻 / 下一阶段」和阶段计划列表
     'cet'    → 六级轨道，独立显示，不参与课内阶段排队
   ============================================================ */

'use strict';

var DEFAULT_PLAN = {
  version: 2,
  updatedAt: '2026-10-31',

  phases: [
    {
      id: 'c1',
      track: 'course',
      name: '数字逻辑冲刺',
      start: '2026-10-31',
      end: '2026-11-11',
      main: '数字逻辑',
      secondary: '离散数学',
      examName: '数字逻辑考试',
      examDate: '2026-11-11'
    },
    {
      id: 'c2',
      track: 'course',
      name: '离散数学 + 仿真收尾',
      start: '2026-11-12',
      end: '2026-11-18',
      main: '离散数学',
      secondary: '机器人足球仿真',
      examName: '机器人足球仿真期末考试',
      examDate: '2026-11-18'
    },
    {
      id: 'c3',
      track: 'course',
      name: '离散数学最后冲刺',
      start: '2026-11-19',
      end: '2026-11-21',
      main: '离散数学',
      secondary: '',
      examName: '离散数学考试',
      examDate: '2026-11-21'
    },

    {
      id: '0',
      track: 'cet',
      name: '第 1 周',
      start: '2026-10-31',
      end: '2026-11-06',
      main: '阅读',
      secondary: '',
      examName: '',
      examDate: ''
    },
    {
      id: '1',
      track: 'cet',
      name: '第 2–3 周',
      start: '2026-11-07',
      end: '2026-11-20',
      main: '翻译 + 作文',
      secondary: '',
      examName: '',
      examDate: ''
    },
    {
      id: '2',
      track: 'cet',
      name: '第 4–6 周',
      start: '2026-11-21',
      end: '2026-12-12',
      main: '刷真题 + 积累词汇短语句型',
      secondary: '',
      examName: '',
      examDate: ''
    }
  ],

  /* 六级考试本身（单独一个日期，不挂在某一段上） */
  cetExam: { name: '六级考试', date: '2026-12-12' },

  /* 清单里的固定项。group 只有三种：
       'phase' → 当前阶段（自动生成，也可自己往里加）
       'daily' → 每日固定
       'mine'  → 我的计划
     这里的 id 就是打卡记录的 key（daily-log），改名字不会丢历史。 */
  tasks: [
    { id: 'words',   name: '背单词', group: 'daily' },
    { id: 'english', name: '练英文', group: 'daily' },
    { id: 'workout', name: '锻炼',   group: 'daily' },
    { id: 'audio',   name: '听音频', group: 'daily' }
  ]
};
