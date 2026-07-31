import { mongoose } from 'mongoose';

const contactSubmissionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, default: 'NEW' },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'contact_submissions' },
);

export const ContactSubmission =
  mongoose.models.ContactSubmission ||
  mongoose.model('ContactSubmission', contactSubmissionSchema);

export default ContactSubmission;
