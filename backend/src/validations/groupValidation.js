const { z } = require('zod');

const createGroupSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Group name is required'),
    type: z.enum(['friends', 'family', 'custom']).optional().default('custom'),
    members: z.array(z.string()).optional(),
  })
});

const updateGroupSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    type: z.enum(['friends', 'family', 'custom']).optional(),
    members: z.array(z.string()).optional(),
  })
});

const manageMemberSchema = z.object({
  body: z.object({
    memberId: z.string().min(1, 'Member ID is required'),
  })
});

module.exports = {
  createGroupSchema,
  updateGroupSchema,
  manageMemberSchema
};
