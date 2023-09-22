require("dotenv").config();
const knex = require("../database/knex");

const listCustomers = async (req, res) => {
	try {
		await knex("charges")
			.where("duedate", "<", knex.fn.now())
			.andWhere("status", "pendente")
			.update({ status: "vencido" });
		const listPaymentsOn = await knex("customers")
			.distinct("customers.id", "customers.*", "status")
			.leftJoin("charges", "customers.id", "=", function () {
				this.select("id")
					.from("charges")
					.whereRaw("charges.customerid = customers.id")
					.orderBy("id", "asc")
					.limit(1);
			})
			.whereNotExists(function () {
				this.select("*")
					.from("charges")
					.whereRaw("customers.id = charges.customerId")
					.whereIn("charges.status", ["pendente", "vencido"]);
			})
			.where((builder) => {
				builder.whereIn("status", ["pago"]).orWhereNull("status");
			});

		const listDefaulters = await knex("customers")
			.modify(function (queryBuilder) {
				if (process.env.NODE_ENV === "production") {
					queryBuilder.distinctOn("customers.id");
				} else {
					queryBuilder.groupBy("customers.id");
				}
			})
			.select("customers.*", "charges.status")
			.leftJoin("charges", "customers.id", "=", "charges.customerid")
			.whereIn("status", ["pendente", "vencido"]);

		return res.json({ customers: [...listPaymentsOn, ...listDefaulters] });
	} catch (error) {
		return res.status(500).json({ mensagem: error.message });
	}
};

const createCustomers = async (req, res) => {
	const {
		name,
		email,
		cpf,
		phone,
		zipcode,
		street,
		complement,
		neighborhood,
		city,
		state,
	} = req.body;

	try {
		await knex("charges")
			.where("duedate", "<", knex.fn.now())
			.andWhere("status", "pendente")
			.update({ status: "vencido" });
		const emailExists = await knex("customers").where({ email }).first();

		if (emailExists) {
			return res.status(203).json({ message: "O e-mail já existe." });
		}

		const cpfExists = await knex("customers").where({ cpf }).first();

		if (cpfExists) {
			return res.status(203).json({ message: "O cpf já existe." });
		}

		const customer = await knex("customers")
			.insert({
				name,
				email,
				cpf,
				phone,
				zipcode,
				street,
				complement,
				neighborhood,
				city,
				state,
			})
			.returning("*");

		if (!customer) {
			return res
				.status(400)
				.json("Não foi possível cadastrar o cliente.");
		}

		return res.status(201).json(customer[0]);
	} catch (error) {
		return res.status(500).json({ mensagem: error.message });
	}
};

const listCustomersMetrics = async (req, res) => {
	try {
		await knex("charges")
			.where("duedate", "<", knex.fn.now())
			.andWhere("status", "pendente")
			.update({ status: "vencido" });
		const paymentsOnTotal = await knex("customers")
			.leftJoin("charges", "customers.id", "=", function () {
				this.select("id")
					.from("charges")
					.whereRaw("charges.customerid = customers.id")
					.orderBy("id", "asc")
					.limit(1);
			})
			.whereNotExists(function () {
				this.select("*")
					.from("charges")
					.whereRaw("customers.id = charges.customerId")
					.whereIn("charges.status", ["pendente", "vencido"]);
			})
			.where((builder) => {
				builder.whereIn("status", ["pago"]).orWhereNull("status");
			})
			.countDistinct("customers.id as total")
			.first();

		const listPaymentsOn = await knex("customers")
			.distinct("customers.id", "customers.*", "status")
			.leftJoin("charges", "customers.id", "=", function () {
				this.select("id")
					.from("charges")
					.whereRaw("charges.customerid = customers.id")
					.orderBy("id", "asc")
					.limit(1);
			})
			.whereNotExists(function () {
				this.select("*")
					.from("charges")
					.whereRaw("customers.id = charges.customerId")
					.whereIn("charges.status", ["pendente", "vencido"]);
			})
			.where((builder) => {
				builder.whereIn("status", ["pago"]).orWhereNull("status");
			});

		const defaultersTotal = await knex("customers")
			.leftJoin("charges", "customers.id", "=", "charges.customerid")
			.whereIn("status", ["pendente", "vencido"])
			.countDistinct("customers.id as total")
			.first();

		const listDefaulters = await knex("customers")
			.modify(function (queryBuilder) {
				if (process.env.NODE_ENV === "production") {
					queryBuilder.distinctOn("customers.id");
				} else {
					queryBuilder.groupBy("customers.id");
				}
			})
			.select("customers.*", "charges.status")
			.leftJoin("charges", "customers.id", "=", "charges.customerid")
			.whereIn("status", ["pendente", "vencido"]);

		return res.status(200).json({
			paymentsOn: {
				paymentsOnTotal,
				paymentsOnList: listPaymentsOn,
			},
			defaulters: {
				defaultersTotal,
				defaultersList: listDefaulters,
			},
		});
	} catch (error) {
		return res.status(400).json({ mensagem: error.message });
	}
};

const detailCustomers = async (req, res) => {
	const { customerid } = req.params;

	try {
		const detailsCustomer = await knex("customers").where(
			"id",
			Number(customerid)
		);

		return res.status(200).json({ detailsCustomer });
	} catch (error) {
		return res.status(400).json(error.message);
	}
};

const detailCustomerCharges = async (req, res) => {
	const { customerid } = req.params;

	try {
		const detailsCustomerCharges = await knex("charges").where("customerid", Number(customerid));

		return res.status(200).json({ detailsCustomerCharges });
	} catch (error) {
		return res.status(400).json(error.message);
	}
};

const updateCustomers = async (req, res) => {
	const { customerid } = req.params;

	const {
		name,
		email,
		cpf,
		phone,
		zipcode,
		street,
		complement,
		neighborhood,
		city,
		state,
	} = req.body;

	try {
		let errors = [];
		const customer = await knex("customers")
			.where("id", customerid)
			.first();

		if (!customer) {
			return res.status(404).json({ message: "Cliente não encontrado." });
		}

		const emailAlreadyExists = await knex("customers")
			.where("email", email)
			.first();

		if (emailAlreadyExists && emailAlreadyExists.id !== customer.id) {
			errors.push({
				type: "email",
				message:"Uma conta com esse email ja existe"
			});
		}

		const cpfAlreadyExists = await knex("customers").where("cpf", cpf).first();

		if (cpfAlreadyExists && cpfAlreadyExists.id !== customer.id) {
			errors.push({
				type: "cpf",
				message:"Uma conta com esse cpf ja existe"
			});
		}

		const phoneAlreadyExists = await knex("customers").where("phone", phone).first();

		if (phoneAlreadyExists && phoneAlreadyExists.id !== customer.id) {
			errors.push({
				type: "phone",
				message:"Uma conta com esse telefone ja existe"
			});
		}

		if(errors.length > 0){
			return res.status(400).json({ errors });
		}

		await knex("customers").where("id", customerid).update({
			name,
			email,
			cpf,
			phone,
			zipcode,
			street,
			complement,
			neighborhood,
			city,
			state,
		});

		const updatedCustomer = await knex("customers")
			.where("id", customerid)
			.first();

		return res.status(200).json(updatedCustomer);
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

module.exports = {
	listCustomers,
	createCustomers,
	listCustomersMetrics,
	detailCustomers,
	detailCustomerCharges,
	updateCustomers,
};
