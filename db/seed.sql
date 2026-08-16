-- US Excellence Awards (USEA) seed data
-- Categories + nominees for categories/nominees tables on Supabase

INSERT INTO categories (name, slug, description) VALUES
  ('Best U.S. Political Party', 'us-political-party', 'National parties recognized by public vote for impact and engagement.'),
  ('Best U.S. President', 'us-president', 'Former and current U.S. presidents recognized by public vote.'),
  ('Best U.S. Debater', 'us-debater', 'Lawmakers and public figures recognized for debate performance.'),
  ('Best U.S. Senator', 'us-senator', 'Sitting U.S. senators recognized by public vote for service.'),
  ('Best U.S. Mayor', 'us-mayor', 'City mayors recognized by public vote for leadership.'),
  ('Best Young U.S. Politician', 'young-us-politician', 'Rising U.S. political figures recognized by public vote.'),
  ('Best U.S. Influencer', 'us-influencer', 'Media personalities and commentators shaping public conversation.'),
  ('Best African Youth Leader', 'african-youth-leader', 'Young African leaders recognized for civic and community impact.')
ON CONFLICT (slug) DO NOTHING;

-- Best U.S. Political Party
INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT v.name, c.id, NULL, v.bio, NULL
FROM categories c
JOIN (VALUES
  ('Republican Party', 'Republican Party'),
  ('Democratic Party', 'Democratic Party')
) AS v(name, bio) ON true
WHERE c.slug = 'us-political-party';

-- Best U.S. President
INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT v.name, c.id, NULL, v.bio, NULL
FROM categories c
JOIN (VALUES
  ('Barack Obama', 'Democratic'),
  ('Donald Trump', 'Republican'),
  ('Joe Biden', 'Democratic')
) AS v(name, bio) ON true
WHERE c.slug = 'us-president';

-- Best U.S. Debater
INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT v.name, c.id, NULL, v.bio, NULL
FROM categories c
JOIN (VALUES
  ('Brandon Gill', 'Republican'),
  ('Jamie Raskin', 'Democratic'),
  ('Jim Jordan', 'Republican'),
  ('Hakeem Jeffries', 'Democratic'),
  ('Bernie Sanders', 'Independent')
) AS v(name, bio) ON true
WHERE c.slug = 'us-debater';

-- Best U.S. Senator
INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT v.name, c.id, NULL, v.bio, NULL
FROM categories c
JOIN (VALUES
  ('John Thune', 'Republican'),
  ('Ted Cruz', 'Republican'),
  ('Chuck Schumer', 'Democratic'),
  ('Cory Booker', 'Democratic'),
  ('Chris Coons', 'Democratic')
) AS v(name, bio) ON true
WHERE c.slug = 'us-senator';

-- Best U.S. Mayor
INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT v.name, c.id, NULL, v.bio, NULL
FROM categories c
JOIN (VALUES
  ('Eric Adams', 'Democratic'),
  ('Karen Bass', 'Democratic'),
  ('Bruce Harrell', 'Democratic'),
  ('Francis Suarez', 'Republican')
) AS v(name, bio) ON true
WHERE c.slug = 'us-mayor';

-- Best Young U.S. Politician
INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT v.name, c.id, NULL, v.bio, NULL
FROM categories c
JOIN (VALUES
  ('Brandon Gill', 'Republican'),
  ('Maxwell Frost', 'Democratic'),
  ('Alexandria Ocasio-Cortez', 'Democratic'),
  ('Wes Moore', 'Democratic')
) AS v(name, bio) ON true
WHERE c.slug = 'young-us-politician';

-- Best U.S. Influencer
INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT v.name, c.id, NULL, v.bio, NULL
FROM categories c
JOIN (VALUES
  ('Charlie Kirk', 'Republican'),
  ('Joe Rogan', 'Independent'),
  ('Ben Shapiro', 'Republican')
) AS v(name, bio) ON true
WHERE c.slug = 'us-influencer';

-- Best African Youth Leader
INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT v.name, c.id, v.country, v.country, NULL
FROM categories c
JOIN (VALUES
  ('Mzalendo Vincent Koech', 'Kenya'),
  ('Collen Malatji', 'South Africa'),
  ('Ter Manyang', 'South Sudan'),
  ('Omar El Hyani', 'Morocco'),
  ('Ibrahim Benbrahim', 'Algeria')
) AS v(name, country) ON true
WHERE c.slug = 'african-youth-leader';
