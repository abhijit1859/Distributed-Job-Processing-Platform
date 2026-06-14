"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobControllers = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../../db/client");
const z = __importStar(require("zod"));
const database_queue_1 = require("../../core/queue/database-queue");
const enqueueSchema = z.object({
    name: z.string().min(3, "minimum of length 3"),
    payload: z.object({
        url: z.string().url("Invalid payload url"),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.unknown().optional()
    }),
    priority: z.number().int().min(0).max(30).optional(),
    runAt: z.string().datetime().transform((val) => new Date(val)).optional(),
    maxRetries: z.number().int().min(0).optional(),
    backoffType: z.nativeEnum(client_1.BackoffType).optional(),
    timeout: z.number().int().positive().optional()
});
const queue = new database_queue_1.DatabaseQueue();
class jobControllers {
    static enqueue(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const parsed = enqueueSchema.safeParse(req.body);
                if (!parsed.success) {
                    res.status(400).json({
                        success: false,
                        errors: parsed.error.format()
                    });
                    return;
                }
                const _a = parsed.data, { name, payload } = _a, options = __rest(_a, ["name", "payload"]);
                const job = yield queue.enqueue(name, payload, options);
                res.status(201).json({
                    success: true,
                    data: job
                });
            }
            catch (error) {
                console.error(error);
                res.status(500).json({
                    message: error
                });
            }
        });
    }
    static listJobs(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const jobs = yield client_2.prisma.job.findMany({
                orderBy: { updatedAt: 'desc' }
            });
            res.status(200).json({
                "JOBS": jobs
            });
        });
    }
    static getJob(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = req.params.id;
            try {
                const job = yield client_2.prisma.job.findUnique({
                    where: { id }
                });
                if (!job) {
                    console.log(`No job found with id JOB-ID:${id}`);
                }
                res.status(200).json({
                    job
                });
            }
            catch (error) {
                console.error(error);
                res.status(500).json({
                    message: "Internal server error"
                });
            }
        });
    }
    static cancelJob(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
}
exports.jobControllers = jobControllers;
