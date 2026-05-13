// routes/favorites.js
// GET    /api/favorites                              — enriched favorites list
// POST   /api/favorites/channels                    — { uniqueId } add channel
// DELETE /api/favorites/channels/:id                — remove channel
// POST   /api/favorites/groups                      — { name } create group
// PUT    /api/favorites/groups/:id                  — { name } rename group
// DELETE /api/favorites/groups/:id                  — delete group
// POST   /api/favorites/groups/:id/channels         — { uniqueId } add to group
// DELETE /api/favorites/groups/:id/channels/:chId   — remove from group

'use strict';

const express = require('express');

// Enrich a list of uniqueId strings with channel objects from channelManager.
function enrichChannels(ids, channelManager) {
  if (!channelManager) return ids.map(id => ({ uniqueId: id }));
  return ids
    .map(id => channelManager.getChannel(parseInt(id, 10)))
    .filter(Boolean);
}

module.exports = function favoritesModule(favoritesManager, appState) {
  const router = express.Router();

  // GET /api/favorites
  router.get('/', (_req, res) => {
    const raw = favoritesManager.getRaw();
    const cm  = appState?.channelManager;
    res.json({
      channels: enrichChannels(raw.channels, cm),
      groups: raw.groups.map(g => ({
        ...g,
        channels: enrichChannels(g.channels, cm),
      })),
    });
  });

  // POST /api/favorites/channels  { uniqueId }
  router.post('/channels', (req, res) => {
    const { uniqueId } = req.body;
    if (!uniqueId) return res.status(400).json({ error: 'uniqueId required' });
    favoritesManager.addChannel(uniqueId);
    res.json({ success: true });
  });

  // DELETE /api/favorites/channels/:id
  router.delete('/channels/:id', (req, res) => {
    favoritesManager.removeChannel(req.params.id);
    res.json({ success: true });
  });

  // POST /api/favorites/groups  { name }
  router.post('/groups', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const group = favoritesManager.createGroup(name);
    res.json({ success: true, group });
  });

  // PUT /api/favorites/groups/:id  { name }
  router.put('/groups/:id', (req, res) => {
    const { name } = req.body;
    const g = favoritesManager.renameGroup(req.params.id, name);
    if (!g) return res.status(404).json({ error: 'Group not found' });
    res.json({ success: true, group: g });
  });

  // DELETE /api/favorites/groups/:id
  router.delete('/groups/:id', (req, res) => {
    favoritesManager.deleteGroup(req.params.id);
    res.json({ success: true });
  });

  // POST /api/favorites/groups/:id/channels  { uniqueId }
  router.post('/groups/:id/channels', (req, res) => {
    const { uniqueId } = req.body;
    if (!uniqueId) return res.status(400).json({ error: 'uniqueId required' });
    const g = favoritesManager.addChannelToGroup(req.params.id, uniqueId);
    if (!g) return res.status(404).json({ error: 'Group not found' });
    res.json({ success: true });
  });

  // DELETE /api/favorites/groups/:id/channels/:chId
  router.delete('/groups/:id/channels/:chId', (req, res) => {
    const g = favoritesManager.removeChannelFromGroup(req.params.id, req.params.chId);
    if (!g) return res.status(404).json({ error: 'Group not found' });
    res.json({ success: true });
  });

  return router;
};
