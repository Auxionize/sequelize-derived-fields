'use strict';

const expect = require('./setup').expect;
const config = require('./setup').dbConfig;

const Sequelize = require('sequelize');
require('../index')(Sequelize);

const sequelize = new Sequelize(config.database, config.username, config.password, config);

describe('NestedOrderBy', function () {
	let Master, Detail, Supreme;

	beforeEach(function* () {
		Master = sequelize.define('Master', {
			name: Sequelize.STRING,
			ucName: {
				type: Sequelize.VIRTUAL,
				sqlExpr: function (alias) {
					return sequelize.fn('UPPER', sequelize.col(`${alias}.name`))
				}
			}
		});
		Detail = sequelize.define('Detail', {
			name: Sequelize.STRING,
			lcName: {
				type: Sequelize.VIRTUAL(Sequelize.STRING),
				sqlExpr: function (alias) {
					return sequelize.fn('LOWER', sequelize.col(`${alias}.name`))
				}
			}
		}, {});
		Supreme = sequelize.define('Supreme', {
			name: Sequelize.STRING
		}, {});

		Detail.belongsTo(Master);
		Detail.belongsTo(Master, { as: 'SecondMaster' });
		Master.hasMany(Detail);
		Master.hasOne(Supreme);

		yield sequelize.sync({ force: true });

		yield Master.create({
			name: 'Master 1.1',
			Details: [{
				name: 'Detail 1.1.1'
			}, {
				name: 'Detail 1.1.2'
			}, {
				name: 'Detail 1.1.3'
			}],
			Supreme: {
				name: 'Supreme 1'
			}
		}, {
			include: [ Detail, Supreme ]
		});
		yield Master.create({
			name: 'Master 2.1',
			Details: [{
				name: 'Detail 2.1.1'
			}, {
				name: 'Detail 2.1.2'
			}, {
				name: 'Detail 2.1.3'
			}],
			Supreme: {
				name: 'Supreme 2'
			}
		}, {
			include: [ Detail, Supreme ]
		});
	});

	it('should define test models', function* () {
		expect(Master).to.be.an.instanceof(sequelize.Model);
		expect(Detail).to.be.an.instanceof(sequelize.Model);
		expect(Supreme).to.be.an.instanceof(sequelize.Model);
	});

	it('should order by \'$Nested.attribute$\'', function*() {
		let instances = yield Detail.findAll({
			include: {
				association: Detail.associations.Master
			},
			order: ['$Master.name$'],
			logging: console.log
		});

		expect(instances).to.be.instanceof(Array);
	});

	it('should order by [\'$Nested.attribute$\', \'DIR\']', function*() {
		let instances = yield Detail.findAll({
			include: {
				association: Detail.associations.Master
			},
			order: [['$Master.id$', 'DESC']],
			logging: console.log
		});

		expect(instances).to.be.instanceof(Array);
	});

	it('should order by \'$Own.attribute$\'', function*() {
		let instances = yield Detail.findAll({
			include: {
				association: Detail.associations.Master
			},
			order: ['$Detail.name$'],
			logging: console.log
		});

		expect(instances).to.be.instanceof(Array);
	});

	it('should order by [\'$Own.attribute$\', \'DIR\']', function*() {
		let instances = yield Detail.findAll({
			include: {
				association: Detail.associations.Master
			},
			order: [['$Detail.name$', 'DESC']],
			logging: console.log
		});

		expect(instances).to.be.instanceof(Array);
	});

	describe('with derived attributes', function () {
		it('should order by \'own-derived-attribute\'', function*() {
			let instances = yield Detail.findAll({
				include: {
					association: Detail.associations.Master
				},
				order: ['lcName'],
				logging: console.log
			});

			expect(instances).to.be.instanceof(Array);
		});

		it('should order by [\'$own-derived-attribute$\', \'DIR\']', function*() {
			let instances = yield Detail.findAll({
				include: {
					association: Detail.associations.Master
				},
				order: [['$lcName$', 'DESC']],
				logging: console.log
			});

			expect(instances).to.be.instanceof(Array);
		});

		it('should order by \'$Own.derived-attribute$\'', function*() {
			let instances = yield Detail.findAll({
				include: {
					association: Detail.associations.Master
				},
				order: ['$Detail.lcName$'],
				logging: console.log
			});

			expect(instances).to.be.instanceof(Array);
		});

		it('should order by [\'$Own.derived-attribute$\', \'DIR\']', function*() {
			let instances = yield Detail.findAll({
				include: {
					association: Detail.associations.Master
				},
				order: [['$Detail.lcName$', 'DESC']],
				logging: console.log
			});

			expect(instances).to.be.instanceof(Array);
		});

		it('should order by \'$Nested.derived-attribute$\'', function*() {
			let instances = yield Detail.findAll({
				include: {
					association: Detail.associations.Master
				},
				order: ['$Master.ucName$'],
				logging: console.log
			});

			expect(instances).to.be.instanceof(Array);
		});

		it('should order by [\'$Nested.derived-attribute$\', \'DIR\']', function*() {
			let instances = yield Detail.findAll({
				include: {
					association: Detail.associations.Master
				},
				order: [['$Master.ucName$', 'DESC']],
				logging: console.log
			});

			expect(instances).to.be.instanceof(Array);
		});
	});
});
