INSERT INTO categories (name, slug, description, payment_mode) VALUES
  ('Best Influencer Award', 'influencer', 'Digital creators shaping culture and conversation nationwide.', 'standard'),
  ('Best Political Party Award', 'party', 'Organizations recognized for civic engagement and impact.', 'standard'),
  ('Best Congressman Award', 'congressman', 'Elected officials recognized by public vote for service.', 'standard'),
  ('Best Blogger Award', 'blogger', 'Independent writers and publishers reaching national audiences.', 'standard'),
  ('Best African Youth Leader', 'african-youth-leader', 'Young leaders driving change across the African continent.', 'mpesa')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT 'Maya Torres', id, 'CA', 'Lifestyle and small-business creator.', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400'
FROM categories WHERE slug = 'influencer';

INSERT INTO nominees (name, category_id, state, bio, photo_url)
SELECT 'Rep. Daniel Whitfield', id, 'GA', 'Recognized for constituent services.', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400'
FROM categories WHERE slug = 'congressman';

INSERT INTO nominees (name, category_id, bio, photo_url)
SELECT 'Amara Okafor', id, 'Community organizer mobilizing youth-led civic programs.', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400'
FROM categories WHERE slug = 'african-youth-leader';
