'use strict';

const derivedFields = require('./lib/derived-fields');
const derivedOrderBy = require('./lib/derived-orderby');

module.exports = function (Sequelize) {
	derivedFields(Sequelize);
	derivedOrderBy(Sequelize);
};