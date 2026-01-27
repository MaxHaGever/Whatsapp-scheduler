import { Request, Response, NextFunction } from "express";
import { User } from "../models/User";
import { BusinessModel } from "../models/Business";
import { generateToken } from "../utils/generateToken";
import { AuthenticateRequest } from "../middleware/authMiddleware";

export const register = async (req: Request, res: Response, next: NextFunction) => {
  const { username, email, password, businessName, timezone } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(400).json({ message: "Email already exists" });
      return;
    }

    const business = await BusinessModel.create({
      name: businessName ?? `${username}'s Business`,
      timezone: timezone ?? "Asia/Jerusalem",
    });

    const newUser = await User.create({
      username,
      email,
      password,
      businessId: business._id,
    });

    const token = generateToken(newUser._id.toString(), business._id.toString());

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        businessId: business._id,
      },
      business: {
        id: business._id,
        name: business.name,
        timezone: business.timezone,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.status(400).json({ message: "Invalid email or password" });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(400).json({ message: "Invalid email or password" });
      return;
    }

    const token = generateToken(user._id.toString(), user.businessId.toString());

    res.status(200).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        businessId: user.businessId,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updatePassword = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction
) => {
  const { oldPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      res.status(400).json({ message: "Invalid old password" });
      return;
    }

    user.password = newPassword;
    user.markModified("password");
    await user.save();

    res.status(200).json({ message: "Password updated" });
  } catch (error) {
    next(error);
  }
};
