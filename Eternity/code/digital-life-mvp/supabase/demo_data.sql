-- ====================================
-- 演示数据生成脚本
-- 用于快速测试知识图谱系统
-- ====================================

-- 注意：请将 YOUR_PROJECT_ID 替换为实际的项目ID
-- 可以从 projects 表中查询：SELECT id FROM projects WHERE owner_id = auth.uid();

-- 清理现有演示数据（可选，谨慎使用）
-- DELETE FROM memories WHERE project_id = 'YOUR_PROJECT_ID';
-- DELETE FROM event_places WHERE event_id IN (SELECT id FROM events WHERE project_id = 'YOUR_PROJECT_ID');
-- DELETE FROM event_people WHERE event_id IN (SELECT id FROM events WHERE project_id = 'YOUR_PROJECT_ID');
-- DELETE FROM events WHERE project_id = 'YOUR_PROJECT_ID';
-- DELETE FROM time_refs WHERE project_id = 'YOUR_PROJECT_ID';
-- DELETE FROM places WHERE project_id = 'YOUR_PROJECT_ID';
-- DELETE FROM people WHERE project_id = 'YOUR_PROJECT_ID';

-- ====================================
-- 1. 插入人物数据
-- ====================================

INSERT INTO people (project_id, name, aliases, role, bio_snippet, importance_score, created_from) VALUES
('YOUR_PROJECT_ID', '父亲', ARRAY['爸爸', '老爸', '老刘'], '父亲', '一位严肃但温暖的小学教师', 95, '演示数据'),
('YOUR_PROJECT_ID', '母亲', ARRAY['妈妈', '老妈'], '母亲', '温柔善良的家庭主妇', 95, '演示数据'),
('YOUR_PROJECT_ID', '祖父', ARRAY['爷爷'], '祖父', '退休工人，喜欢下棋', 75, '演示数据'),
('YOUR_PROJECT_ID', '祖母', ARRAY['奶奶'], '祖母', '慈祥的老人，做得一手好菜', 75, '演示数据'),
('YOUR_PROJECT_ID', '张老师', ARRAY['张教师'], '老师', '小学班主任，对我影响很大', 60, '演示数据'),
('YOUR_PROJECT_ID', '小明', ARRAY['明明'], '同学', '童年最好的朋友', 50, '演示数据');

-- ====================================
-- 2. 插入地点数据
-- ====================================

-- 国家级
INSERT INTO places (project_id, name, place_level, description) VALUES
('YOUR_PROJECT_ID', '中国', 'country', '我的祖国'),
('YOUR_PROJECT_ID', '美国', 'country', '大学交换时去过');

-- 城市级
INSERT INTO places (project_id, name, place_level, parent_place_id, lat, lng, description) VALUES
('YOUR_PROJECT_ID', '牡丹江', 'city', 
  (SELECT id FROM places WHERE name = '中国' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
  44.5819, 129.6339, '我的出生地和童年生活的地方'),
('YOUR_PROJECT_ID', '哈尔滨', 'city',
  (SELECT id FROM places WHERE name = '中国' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
  45.8038, 126.5340, '初中和高中就读的城市'),
('YOUR_PROJECT_ID', '北京', 'city',
  (SELECT id FROM places WHERE name = '中国' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
  39.9042, 116.4074, '大学就读的城市');

-- 具体地点
INSERT INTO places (project_id, name, place_level, parent_place_id, description) VALUES
('YOUR_PROJECT_ID', '牡丹江第一小学', 'point',
  (SELECT id FROM places WHERE name = '牡丹江' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
  '父亲任教的学校，我也在这里上学'),
('YOUR_PROJECT_ID', '中山公园', 'point',
  (SELECT id FROM places WHERE name = '牡丹江' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
  '童年常去的公园，每年冬天有冰雕'),
('YOUR_PROJECT_ID', '老家属楼', 'point',
  (SELECT id FROM places WHERE name = '牡丹江' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
  '我出生和成长的地方，5楼的两室一厅');

-- ====================================
-- 3. 插入时间引用
-- ====================================

INSERT INTO time_refs (project_id, type, text, start_date, end_date, confidence) VALUES
('YOUR_PROJECT_ID', 'exact', '1985年7月15日', '1985-07-15', NULL, 1.0),
('YOUR_PROJECT_ID', 'range', '小学三年级', '1993-09-01', '1994-06-30', 0.8),
('YOUR_PROJECT_ID', 'fuzzy', '那年冬天', '1994-12-01', '1995-02-28', 0.6),
('YOUR_PROJECT_ID', 'range', '1995年夏天', '1995-06-01', '1995-08-31', 0.9),
('YOUR_PROJECT_ID', 'exact', '2000年9月', '2000-09-01', NULL, 1.0);

-- ====================================
-- 4. 插入事件数据
-- ====================================

INSERT INTO events (project_id, title, summary, time_ref_id, tags, evidence, importance_score, verified) VALUES
('YOUR_PROJECT_ID', 
 '出生', 
 '我出生在牡丹江市人民医院，是家里的第一个孩子',
 (SELECT id FROM time_refs WHERE text = '1985年7月15日' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 ARRAY['出生', '童年', '家庭'],
 '[{"text": "1985年7月15日凌晨，母亲在医院顺利生下了我", "source": "家庭回忆录"}]'::jsonb,
 100,
 true),

('YOUR_PROJECT_ID',
 '第一次看雪雕',
 '父亲带我去中山公园看冰雕，那是我第一次看到如此壮观的冰雕展览',
 (SELECT id FROM time_refs WHERE text = '那年冬天' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 ARRAY['童年', '父亲', '冬天', '公园'],
 '[{"text": "记得那年冬天，爸爸带我去公园看雪雕，母亲给我们准备了热水瓶", "source": "对话记录"}]'::jsonb,
 80,
 true),

('YOUR_PROJECT_ID',
 '小学开学第一天',
 '第一次背着书包去上学，父亲送我到学校门口',
 (SELECT id FROM time_refs WHERE text = '小学三年级' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 ARRAY['童年', '学校', '父亲'],
 '[{"text": "小学三年级开学第一天，我特别紧张，父亲一直鼓励我", "source": "回忆"}]'::jsonb,
 70,
 false),

('YOUR_PROJECT_ID',
 '暑假游泳',
 '和小明一起去游泳池学游泳，差点溺水被救生员救起',
 (SELECT id FROM time_refs WHERE text = '1995年夏天' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 ARRAY['童年', '夏天', '朋友', '游泳'],
 '[{"text": "那个夏天，我和小明几乎每天都去游泳", "source": "日记"}]'::jsonb,
 60,
 true);

-- ====================================
-- 5. 建立事件-人物关联
-- ====================================

-- 出生事件
INSERT INTO event_people (event_id, person_id, role) VALUES
((SELECT id FROM events WHERE title = '出生' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM people WHERE name = '母亲' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 '主角');

-- 看雪雕事件
INSERT INTO event_people (event_id, person_id, role) VALUES
((SELECT id FROM events WHERE title = '第一次看雪雕' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM people WHERE name = '父亲' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 '陪同'),
((SELECT id FROM events WHERE title = '第一次看雪雕' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM people WHERE name = '母亲' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 '准备');

-- 上学事件
INSERT INTO event_people (event_id, person_id, role) VALUES
((SELECT id FROM events WHERE title = '小学开学第一天' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM people WHERE name = '父亲' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 '陪同'),
((SELECT id FROM events WHERE title = '小学开学第一天' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM people WHERE name = '张老师' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 '班主任');

-- 游泳事件
INSERT INTO event_people (event_id, person_id, role) VALUES
((SELECT id FROM events WHERE title = '暑假游泳' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM people WHERE name = '小明' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 '同伴');

-- ====================================
-- 6. 建立事件-地点关联
-- ====================================

INSERT INTO event_places (event_id, place_id) VALUES
((SELECT id FROM events WHERE title = '第一次看雪雕' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM places WHERE name = '中山公园' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1)),
((SELECT id FROM events WHERE title = '小学开学第一天' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM places WHERE name = '牡丹江第一小学' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1));

-- ====================================
-- 7. 插入回忆数据
-- ====================================

INSERT INTO memories (project_id, person_id, event_id, place_id, time_ref_id, snippet, quote, importance_score, verified) VALUES
('YOUR_PROJECT_ID',
 (SELECT id FROM people WHERE name = '父亲' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM events WHERE title = '第一次看雪雕' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM places WHERE name = '中山公园' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 (SELECT id FROM time_refs WHERE text = '那年冬天' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 '父亲带我看冰雕的温暖回忆',
 '那天特别冷，但是爸爸一直牵着我的手，给我讲每个冰雕的故事。我记得有一个特别大的龙形冰雕，在阳光下闪闪发光。',
 90,
 true),

('YOUR_PROJECT_ID',
 (SELECT id FROM people WHERE name = '母亲' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 NULL,
 (SELECT id FROM places WHERE name = '老家属楼' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 NULL,
 '母亲做饭的回忆',
 '每天放学回家，老远就能闻到妈妈做饭的香味。她总是知道我最爱吃什么，即使家里条件不好，也总想办法给我做好吃的。',
 85,
 true),

('YOUR_PROJECT_ID',
 (SELECT id FROM people WHERE name = '祖母' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 NULL,
 (SELECT id FROM places WHERE name = '老家属楼' AND project_id = 'YOUR_PROJECT_ID' LIMIT 1),
 NULL,
 '奶奶包饺子',
 '过年的时候，奶奶总是一大早就起来包饺子。她的手艺特别好，饺子皮薄馅大，我一口气能吃二十个。',
 75,
 true);

-- ====================================
-- 完成提示
-- ====================================

SELECT '✅ 演示数据插入完成！' as status,
       (SELECT COUNT(*) FROM people WHERE project_id = 'YOUR_PROJECT_ID') as people_count,
       (SELECT COUNT(*) FROM places WHERE project_id = 'YOUR_PROJECT_ID') as places_count,
       (SELECT COUNT(*) FROM events WHERE project_id = 'YOUR_PROJECT_ID') as events_count,
       (SELECT COUNT(*) FROM memories WHERE project_id = 'YOUR_PROJECT_ID') as memories_count;

-- ====================================
-- 使用说明
-- ====================================

-- 1. 替换所有 YOUR_PROJECT_ID 为实际的项目ID
-- 2. 在 Supabase SQL Editor 中执行此脚本
-- 3. 刷新浏览器，访问以下页面查看效果：
--    - /family (查看6个人物)
--    - /timeline (查看4个事件)
--    - /places (查看9个地点)
-- 4. 点击人物卡片查看详情页
-- 5. 在时间轴页面使用筛选功能
