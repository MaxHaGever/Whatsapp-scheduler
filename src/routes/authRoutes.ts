import express from "express";
import { body } from "express-validator";
import { register, login, updatePassword } from "../controller/authController";
import { protect } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validateRequest";

const router = express.Router();

router.post(
  "/register",
  [
    body("username").notEmpty().withMessage("Username is required"),
    body("email").isEmail().withMessage("Invalid email"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    body("businessName").optional().isString(),
    body("timezone").optional().isString(),
    validateRequest,
  ],
  register
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Invalid email"),
    body("password").notEmpty().withMessage("Password is required"),
    validateRequest,
  ],
  login
);

router.patch(
  "/update-password",
  protect,
  [
    body("oldPassword").notEmpty().withMessage("Old password is required"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters long"),
    validateRequest,
  ],
  updatePassword
);

export default router;
