'use strict';

const derivedFields = require('./lib/derived-fields');
const derivedOrderBy = require('./lib/derived-orderby');

let attached = false;

module.exports = function (Sequelize) {
	if (!attached) {
		derivedFields(Sequelize);
		derivedOrderBy(Sequelize);
	}

	attached = true;
};