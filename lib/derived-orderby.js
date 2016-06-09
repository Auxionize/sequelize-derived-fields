'use strict';

module.exports = function (Sequelize) {
	const Utils = Sequelize.Utils;
	const _ = Utils._;

	Sequelize.addHook('afterInit', function (sequelize) {
		function processOrderItem(item) {
			if (_.isString(item)) {
				if (!Utils.isColString(item[0])) {
					return item;
				}
				item = [item, 'ASC'];
			}

			if (!_.isString(item[0]) || !Utils.isColString(item[0])) {
				return item; // Nothing to do here
			}

			if (item.length === 1) {
				item.push('ASC')
			} else if (item.length !== 2) {
				return item;
			}

			let path = item[0].substr(1, item[0].length - 2).split('.');

			if (path.length === 2 && path[0] === this.name) {
				path.shift();
			}

			item[0] = sequelize.literal(`"${path.join('.')}"`);

			return item;
		}
		
		sequelize.afterDefine(function (model) {
			model.beforeFindAfterOptions(function (options) {
				if (options.order == null) {
					return;
				}

				if (!_.isArray(options.order)) {
					options.order = [options.order];
				}

				options.order = options.order.map(item => processOrderItem.call(this, item));
			});
		});
	});
};