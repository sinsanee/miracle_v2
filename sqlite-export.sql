SET FOREIGN_KEY_CHECKS=0;

INSERT INTO users (userid, admin, banned, lastdrop, lastgrab) VALUES ('1164019070149087302', 0, 0, 1766604919078, 1766604923704);
INSERT INTO users (userid, admin, banned, lastdrop, lastgrab) VALUES ('467686076371304449', 0, 0, 1766163404211, NULL);
INSERT INTO users (userid, admin, banned, lastdrop, lastgrab) VALUES ('803602056631025705', 0, 0, NULL, NULL);
INSERT INTO users (userid, admin, banned, lastdrop, lastgrab) VALUES ('1', 0, 0, NULL, NULL);
INSERT INTO webusers (id, username, password, discordid, admin) VALUES (1, 'sinsane', '$2b$10$Yy4WOh4HvaCIK/BZdFgg9.sjvfE5o9VoZev5v5EKwwdNLIJo0DFWO', NULL, 1);
INSERT INTO webusers (id, username, password, discordid, admin) VALUES (2, 'Indo4', '$2b$10$MkvbwGNA/7gClw.VvKFwF.xsSHPgKakWwYF8WHDPH7wM8HAf5XW1O', NULL, 1);
INSERT INTO sets (id, name, border, rarity, creator, available, default) VALUES (1, 'Alpha', 'cards\\borders\\Alpha.png', 1, '1164019070149087302', 1, 1);
INSERT INTO sets (id, name, border, rarity, creator, available, default) VALUES (2, 'Christmas 2025', 'cards\\borders\\Christmas.png', 100, '1164019070149087302', 0, 0);
INSERT INTO sets (id, name, border, rarity, creator, available, default) VALUES (3, 'Gingerbread', 'cards\\borders\\Gingerbread.png', 1000, '1164019070149087302', 0, 0);
INSERT INTO sets (id, name, border, rarity, creator, available, default) VALUES (4, 'Legends', 'img\\borders\\Legends.png', 1000, '1164019070149087302', 0, 0);

SET FOREIGN_KEY_CHECKS=1;