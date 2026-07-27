import { Router } from 'express';
import { eventController } from '../controllers';
import validationMiddleware from '@/shared/middlewares/validation.middleware';
import { eventValidators } from '../validations/company.validation';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { resolveEventUUID } from '../middlewares/resolveEventId.middleware';
import { resolveCompanyUUID } from '../middlewares/resolveCompanyId.middleware';
import upload from '@/shared/upload/upload';

const router = Router();

router.use(AuthMiddleware.authenticate as any);

// ── SPECIFIC ROUTES FIRST ──
router.get('/stats', eventController.getStatistics.bind(eventController));

router.get('/upcoming',
  validationMiddleware.validateQueryJoi(eventValidators.query),
  eventController.getUpcomingEvents.bind(eventController)
);

router.get('/past',
  validationMiddleware.validateQueryJoi(eventValidators.query),
  eventController.getPastEvents.bind(eventController)
);

router.get('/search',
  validationMiddleware.validateQueryJoi(eventValidators.search),
  eventController.searchEvents.bind(eventController)
);

router.get('/nearby',
  validationMiddleware.validateQueryJoi(eventValidators.nearby),
  eventController.findNearbyEvents.bind(eventController)
);

// ✅ company/:companyId — resolveCompanyUUID lagao
router.get('/company/:companyId',
  validationMiddleware.validateParamsJoi(eventValidators.companyId),
  resolveCompanyUUID,
  eventController.getCompanyEvents.bind(eventController)
);

router.get('/get-all-events',
  validationMiddleware.validateQueryJoi(eventValidators.query),
  eventController.listEvents.bind(eventController)
);

router.post(
  '/create-event',
  (req, res, next) => {
    console.log('=== BEFORE UPLOAD ===');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body:', req.body);
    next();
  },
  upload.uploadFields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 },
    { name: 'documents', maxCount: 5 },
  ]),
  (req, res, next) => {
    console.log('=== AFTER UPLOAD ===');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    next();
  },
  validationMiddleware.validateJoi(eventValidators.create),
  eventController.createEvent.bind(eventController)
);

// ── /:id ROUTES — resolveEventUUID lagao ──
router.get('/:id/attendees',
  validationMiddleware.validateParamsJoi(eventValidators.id),
  resolveEventUUID,
  eventController.getAttendees.bind(eventController)
);

router.get('/:id',
  validationMiddleware.validateParamsJoi(eventValidators.id),
  resolveEventUUID,
  eventController.getEventById.bind(eventController)
);

router.put('/:id',
  validationMiddleware.validateParamsJoi(eventValidators.id),
  resolveEventUUID,
  validationMiddleware.validateJoi(eventValidators.update),
  eventController.updateEvent.bind(eventController)
);

router.patch('/:id/status',
  validationMiddleware.validateParamsJoi(eventValidators.id),
  resolveEventUUID,
  validationMiddleware.validateJoi(eventValidators.status),
  eventController.updateEventStatus.bind(eventController)
);

router.post('/:id/register',
  validationMiddleware.validateParamsJoi(eventValidators.id),
  resolveEventUUID,
  validationMiddleware.validateJoi(eventValidators.register),
  eventController.registerForEvent.bind(eventController)
);

router.delete('/:id/register',
  validationMiddleware.validateParamsJoi(eventValidators.id),
  resolveEventUUID,
  validationMiddleware.validateJoi(eventValidators.register),
  eventController.cancelRegistration.bind(eventController)
);

router.delete('/:id',
  validationMiddleware.validateParamsJoi(eventValidators.id),
  resolveEventUUID,
  eventController.deleteEvent.bind(eventController)
);

export default router;