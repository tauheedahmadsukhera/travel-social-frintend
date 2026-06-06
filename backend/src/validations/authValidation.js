const { z } = require('zod');

const loginFirebaseSchema = z.object({
  body: z.object({
    idToken: z.string().optional(),
    firebaseUid: z.string().min(1, 'Firebase UID is required'),
    email: z.string().nullable().optional(), 
    displayName: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
  })
});

const registerFirebaseSchema = z.object({
  body: z.object({
    idToken: z.string().optional(),
    firebaseUid: z.string().min(1, 'Firebase UID is required'),
    email: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    username: z.string().min(3, 'Username must be at least 3 characters').max(30, 'Username must be at most 30 characters').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores').optional(),
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  })
});

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    displayName: z.string().optional(),
  })
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  })
});

const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    code: z.string().length(6, 'Code must be exactly 6 digits'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  })
});

const usernameSignupSchema = z.object({
  body: z.object({
    username: z.string().min(3, 'Username must be at least 3 characters').max(30, 'Username must be at most 30 characters').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(128, 'Password must be at most 128 characters'),
    name: z.string().max(60, 'Name must be at most 60 characters').optional(),
    avatar: z.string().nullable().optional(),
  })
});

const usernameLoginSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
  })
});

module.exports = {
  loginFirebaseSchema,
  registerFirebaseSchema,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  usernameSignupSchema,
  usernameLoginSchema
};
