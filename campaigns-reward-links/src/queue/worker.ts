import { Worker, Job } from 'bullmq';
// import  Redis from 'ioredis';
import { connection } from './redisConfig';
import axios from 'axios';
import config from '../config.ts';
import Getters from '../db/getters';
import Setters from '../db/setters';
import LogSys from '../helpers/logger';
