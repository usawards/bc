-- Sample categories + nominees for local/demo testing (safe to skip in production)
INSERT INTO categories (name, slug, description) VALUES
  ('Best Influencer Award', 'influencer', 'Digital creators shaping culture and conversation nationwide.'),
  ('Best Political Party Award', 'party', 'Organizations recognized for civic engagement and impact.'),
  ('Best Congressman Award', 'congressman', 'Elected officials recognized by public vote for service.'),
  ('Best Blogger Award', 'blogger', 'Independent writers and publishers reaching national audiences.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT 'Maya Torres', id, 'CA', 'Lifestyle and small-business creator.', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400'
FROM categories WHERE slug = 'influencer';

INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT 'Rep. Daniel Whitfield', id, 'GA', 'Recognized for constituent services.', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400'
FROM categories WHERE slug = 'congressman';
