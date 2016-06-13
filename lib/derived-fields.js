'use strict';

const pluginName = 'sequelize-derived-fields';

module.exports = function (Sequelize) {
	const Utils = Sequelize.Utils;
	const _ = Utils._;

	const DerivedMixin = {
		getDerivedExpr(key, alias) {
			if (this.options.derived[key] != null) {
				return derivedExpr(this.options.derived[key], alias)
			}
			if (!Utils.isColString(key)) {
				return;
			}

			key = key.substr(1, key.length - 2).split('.');

			let associationsPath = key.slice(0, key.length-1),
				field = key[key.length - 1],
				subModel = DerivedMixin.getSubmodel.call(this, associationsPath);

			return DerivedMixin.getDerivedExpr.call(subModel, field, associationsPath.join('.'));
		},

		/**
		 *
		 * @param {Array} associationsPath array of association names
		 * @returns {Model}
		 */
		getSubmodel(associationsPath) {
			if (associationsPath.length === 1 && associationsPath[0] === this.name && !this.associations[associationsPath[0]]) {
				return this;
			}

			return associationsPath.reduce((subModel, assocName) => {
				if (!subModel.associations[assocName]) {
					throw new Error(`Invalid association: ${assocName}`);
				}
				return subModel.associations[assocName].target
			}, this);
		}
	};

	// Prevent attaching the plugin more than once
	if (Sequelize.hasHook('afterInit')) {
		if (_.find(Sequelize.options.hooks.afterInit, hook => hook.name === pluginName)) {
			return; // The plugin has already been attached, so - do nothing
		}
	}

	Sequelize.addHook('afterInit', pluginName, function (sequelize) {
		/*
		 * Extend Model prototype
		 */
		sequelize.Model.prototype.getWhereConditions = function (where) {
			let fo = { where };

			processWhere.call(this, fo);

			return this.QueryGenerator.getWhereConditions(fo.where, this.name, this);
		};

		sequelize.Model.prototype.getDerivedExpr = function (field) {
			let expr = DerivedMixin.getDerivedExpr.call(this, field, this.name);

			if (expr != null) {
				return this.QueryGenerator.whereItemQuery(undefined, expr);
			}
		};

		/**
		 *
		 * @param {object} findOptions
		 * @param {string} alias
		 * @param {string} path
		 */
		function processAttributes(findOptions, alias, path) {
			findOptions.attributes = findOptions.attributes.map(attr => {
				let expr = DerivedMixin.getDerivedExpr.call(this, attr, path.slice(1).concat(alias).join('.'));
				if (expr != null) {
					return [expr, attr];
				}

				return attr;
			});
		}

		/**
		 *
		 * @param {object} findOptions
		 * @param {string} alias
		 */
		function processWhere(findOptions, alias) {
			findOptions = findOptions || {};

			if (findOptions.attributes == null) {
				findOptions.attributes = Object.keys(this.attributes);
			}
			if (findOptions.where == null) {
				return;
			}

			for (let key in findOptions.where) {
				let derivedExpr = DerivedMixin.getDerivedExpr.call(this, key, alias);
				if (derivedExpr != null) {
					if (Utils._.isArray(findOptions.where[key])) {
						findOptions.where[key] = { $in : findOptions.where[key] };
					}
					if (findOptions.where.$and != null) {
						findOptions.where.$and = [
							findOptions.where.$and,
							sequelize.where(derivedExpr, '=', findOptions.where[key])
						]
					} else {
						findOptions.where.$and = sequelize.where(derivedExpr, '=', findOptions.where[key]);
					}

					delete findOptions.where[key];
				}
			}
		}

		/**
		 *
		 * @param {object | object[]} includes
		 * @param {string} path
		 */
		function processInclude(includes, path) {
			includes.forEach(function (inclusion) {
				let includeAs = inclusion.as || Utils.singularize(inclusion.model.name);

				processWhere.call(inclusion.model, inclusion, includeAs);
				processAttributes.call(inclusion.model, inclusion, includeAs, path);
				if (inclusion.include != null) {
					processInclude(inclusion.include, path.concat(includeAs));
				}
			});
		}

		function patchModelCount(Model) {
			let origCount = Model.count;

			Model.count = function (options) {
				processWhere.call(this, options, this.name);
				return origCount.call(this, options);
			}
		}

		sequelize.addHook('beforeDefine', function (attributes, options) {
			let derived = options.derived = options.derived || {};

			// Scan model for virtual attributes which have `sqlExpr` property. Remember them in `options.derived` hash
			// for later use.
			for (let name in attributes) {
				let attr = attributes[name];

				if ((attr.type === Sequelize.VIRTUAL || attr.type instanceof Sequelize.VIRTUAL) && attr.sqlExpr != null) {
					derived[name] = attr.sqlExpr;
					if (attr.get == null) {
						// Assign default getter, if not specified
						attr.get = function () {
							return this.dataValues[name];
						}
					}
					delete attr.sqlExpr;
				}
			}
		});

		sequelize.afterDefine(function (model) {
			if (true || Object.keys(model.options.derived).length > 0) {
				// Current model has derived fields! Attach *beforeFindAfterExpandIncludeAll* hook on it.
				model.beforeFindAfterExpandIncludeAll(function (findOptions) {
					findOptions.model = this;
					findOptions.as = this.name;

					processInclude.call(this, [findOptions], []);
				});
			}
		});

		sequelize.afterDefine(function (Model) {
			if (typeof Model.options.derived === 'object' && Object.keys(Model.options.derived).length > 0) {
				patchModelCount(Model);
			}
		});
	});
};

function derivedExpr(expr, alias) {
	if (typeof expr === 'function') {
		expr = expr(alias);
	}

	return expr;
}