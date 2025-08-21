import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const USER_ROLES = ['admin', 'agent', 'customer'];

const userSchema = new mongoose.Schema(
	{
		name: { type: String, required: true },
		email: { type: String, required: true, unique: true, lowercase: true },
		phone: { type: String },
		password: { type: String, required: true, select: false },
		role: { type: String, enum: USER_ROLES, default: 'customer' },
		isActive: { type: Boolean, default: true }
	},
	{ timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
	if (!this.isModified('password')) return next();
	const salt = await bcrypt.genSalt(10);
	this.password = await bcrypt.hash(this.password, salt);
	next();
});

userSchema.methods.comparePassword = async function (candidate) {
	return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model('User', userSchema);
export const Roles = USER_ROLES;
