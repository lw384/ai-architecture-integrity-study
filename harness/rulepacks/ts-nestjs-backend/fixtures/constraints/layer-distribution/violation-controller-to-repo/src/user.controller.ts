import { UserRepository } from './user.repository';

export class UserController {
  constructor(private readonly userRepository: UserRepository) {}
}