'use strict';

const config = require('../../resources/shared-library.json');

if (!/^[a-f0-9]{32}$/i.test(config.gist_id) || !/^[a-z0-9-]+$/i.test(config.owner)) {
  throw new Error('Cau hinh kho de chung khong hop le.');
}

module.exports = {
  DEFAULT_GIST_ID: config.gist_id,
  SHARED_GIST_OWNER: config.owner,
  isSharedGist: gistId => gistId === config.gist_id
};
