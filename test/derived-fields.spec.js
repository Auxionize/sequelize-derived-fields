'use strict';

const expect = require('./setup').expect;
const config = require('./setup').dbConfig;

const Sequelize = require('sequelize');
require('../index')(Sequelize);

const sequelize = new Sequelize(config.database, config.username, config.password, config);

describe('DerivedFields', function () {
	let Master, Detail, SubDetail, SubSubDetail, now;

	beforeEach(function*() {
		now = new Date();
		Master = sequelize.define('Master', {
			name: Sequelize.STRING,
			validUntil: Sequelize.DATE,
			ucName: {
				type: Sequelize.VIRTUAL,
				sqlExpr: function (alias) {
					return sequelize.fn('UPPER', sequelize.col(`${alias}.name`))
				}
			},
			validInterval: {
				type: Sequelize.VIRTUAL(Sequelize.INTEGER),
				sqlExpr: function (alias) {
					return sequelize.literal(`"${alias}"."validUntil" - NOW()`);
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
		});

		// SubDetail is model w/o derived fields, but associated with Detail, which has derived fields.
		SubDetail = sequelize.define('SubDetail', {
			name: Sequelize.STRING
		});
		SubSubDetail = sequelize.define('SubSubDetail', {
			name: Sequelize.STRING
		});

		Detail.belongsTo(Master);
		Master.hasMany(Detail, {as: 'detailcheta'});
		SubDetail.belongsTo(Detail);
		Detail.hasMany(SubDetail);
		SubSubDetail.belongsTo(SubDetail);
		SubDetail.hasMany(SubSubDetail);

		yield sequelize.sync({force: true});

		yield Master.create({
			name: 'Master',
			validUntil: (new Date(now)).setDate(now.getDate() + 3), // 3 days from now
			detailcheta: [{
				name: 'Detail 1',
				SubDetails: [{
					name: 'sub 1.1',
					SubSubDetails: [{ name: 'Sub Sub 1.1.1'}, { name: 'Sub Sub 1.1.2'}]
				}, {
					name: 'sub 1.2'
				}]
			}, {
				name: 'Detail 2',
				SubDetails: [{
					name: 'sub 2.1'
				}, {
					name: 'sub 2.2',
					SubSubDetails: [{ name: 'Sub Sub 2.2.1'}, { name: 'Sub Sub 2.2.2'}]
				}]
			}, {
				name: 'Detail 3',
				SubDetails: [{
					name: 'sub 3.1'
				}, {
					name: 'sub 3.2'
				}]
			}]
		}, {
			include: [{
				model: Detail,
				as: 'detailcheta',
				include: {
					association: Detail.associations.SubDetails,
					include: {
						association: SubDetail.associations.SubSubDetails
					}
				}
			}]
		});
	});

	it('should count()', function*() {
		let thrown = false;

		try {
			yield Master.count();
		} catch (ex) {
			thrown = true;
			console.error(ex.stack);
		}

		expect(thrown).to.be.false;
	});

	it('should query calucalted attributes', function*() {
		let instance = yield Master.find({
			attributes: ['ucName'],
			where: {
				id: 1
			}
		});

		expect(instance).to.be.ok;
		expect(instance.name).to.be.undefined;
		expect(instance.ucName).to.be.equal('MASTER');
	});

	it('should query calucalted interval', function*() {
		let instance = yield Master.find({
			attributes: ['validInterval'],
			where: {
				validInterval: {
					$lt: sequelize.literal("INTERVAL '3 DAYS'")
				}
			}
		});

		expect(instance).to.be.ok;
		expect(instance.name).to.be.undefined;
		expect(instance.ucName).to.be.undefined;
		expect(instance.validInterval).to.have.properties({
			days: 2,
			hours: 23,
			minutes: 59
		});
	});

	it('should filter by $own.derived$ fields', function* () {
		let instance = yield Master.find({
			where: {
				'$Master.ucName$': 'MASTER'
			}
		});
		expect(instance).to.be.ok;
		expect(instance.ucName).to.be.equal('MASTER');
	});

	it('should query $nested$ derived fields', function* () {
		let detail = yield Detail.find({
			include: {
				association: Detail.associations.Master,
				// attributes: ['name']
			},
			// attributes: ['name'],
			where: {
				lcName: 'detail 1',
				'$Master.ucName$': 'MASTER'
			},
			logging: console.log
		});

		expect(detail).to.be.ok;
	});

	it('should query $nested.derived.field$ from model w/o derived fields', function* () {
		let instance = yield SubSubDetail.find({
			include: {
				association: SubSubDetail.associations.SubDetail,
				include: {
					association: SubDetail.associations.Detail
				},
			},
			where: {
				'$SubDetail.Detail.lcName$': 'detail 1'
			},
			logging: console.log
		});

		expect(instance).to.be.ok;
	});

	it('should query calucalted attributes in includes', function*() {
		let instance = yield Master.find({
			where: {
				id: 1
			},
			include: {
				association: Master.associations.detailcheta,
				attributes: ['name', 'lcName']
			},
			order: ['detailcheta.name']
		});

		expect(instance).to.be.ok;
		expect(instance.id).to.be.equal(1);
		expect(instance.name).to.be.equal('Master');
		expect(instance.ucName).to.be.equal('MASTER');
		expect(instance.detailcheta).to.be.instanceof(Array);
		expect(instance.detailcheta[0].name).to.be.equal('Detail 1');
		expect(instance.detailcheta[0].lcName).to.be.equal('detail 1');
	});

	it('should query by association', function*() {
		let instances = yield Master.findAll({
			where: {
				ucName: 'MASTER',
			},
			include: {
				association: Master.associations.detailcheta,
				attributes: ['lcName'],
				where: {
					lcName: 'detail 1'
				}
			}
		});

		expect(instances).to.be.instanceof(Array);
		expect(instances[0].name).to.be.equal('Master');
		expect(instances[0].detailcheta).to.be.instanceof(Array);
		expect(instances[0].detailcheta[0].name).to.be.undefined;
		expect(instances[0].detailcheta[0].lcName).to.be.equal('detail 1');
	});

	it('should query by <model, as>', function*() {
		let instances = yield Master.findAll({
			where: {
				ucName: 'MASTER',
			},
			include: {
				model: Detail,
				as: 'detailcheta',
				attributes: Object.keys(Detail.attributes),
				where: {
					lcName: 'detail 1'
				}
			}
		});

		expect(instances).to.be.instanceof(Array);
		expect(instances[0].name).to.be.equal('Master');
		expect(instances[0].ucName).to.be.equal('MASTER');
		expect(instances[0].detailcheta).to.be.instanceof(Array);
		expect(instances[0].detailcheta[0].name).to.be.equal('Detail 1');
		expect(instances[0].detailcheta[0].lcName).to.be.equal('detail 1');
	});

	it('should work with findAndCountAll', function* () {
		let result = yield Detail.findAndCountAll({
			include: {
				association: Detail.associations.Master,
				required: true
			},
			where: {
				'$Master.ucName$': 'MASTER'
			},
			logging: true
		});

		expect(result).to.be.ok;
		expect(result.rows).to.be.ok;
		expect(result.count).to.be.ok;
	});

	it('should work in ORDER BY', function* () {
		let instance = yield Master.findAll({
			include: {
				association: Master.associations.detailcheta
			},
			order: [['$detailcheta.lcName$', 'DESC']],
			logging: console.log
		});

		expect(instance).to.be.instanceof(Array);
	});

	it('should work in ORDER BY and WHERE', function* () {
		let instance = yield Master.findAll({
			where: {
				'$Master.ucName$': 'MASTER'
			},
			order: [['$Master.ucName$', 'DESC']]
		});

		expect(instance).to.be.instanceof(Array);
	});
	
	it('QueryGenerator.getWhereConditions', function* () {
		let whereStr = Detail.getWhereConditions({
			'$Master.ucName$': ['MASTER', 'ANOTHER']
		}, 'Detail');

		expect(whereStr).to.be.equal(`UPPER("Master"."name") IN ('MASTER', 'ANOTHER')`);
	});

	it('getDerivedExpr', function () {
		let expr = Master.getDerivedExpr('$detailcheta.lcName$');

		expect(expr).to.be.equal('LOWER("detailcheta"."name")');
	});
});
