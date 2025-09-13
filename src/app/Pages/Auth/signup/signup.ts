import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { useSignup } from '../../../Hooks/Auth/useSignup';
import { Buttom } from '../../../Components';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, Buttom],
  templateUrl: './signup.html',
  styleUrl: './signup.scss'
})
export class Signup {
  signupForm: FormGroup;
  private signupHook = useSignup();

  constructor(private fb: FormBuilder) {
    this.signupForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      role: ['user', [Validators.required]]
    });
  }

  get isPending() {
    return this.signupHook.isPending();
  }

  async onSubmit() {
    if (this.signupForm.valid && !this.isPending) {
      const userData = this.signupForm.value;
      await this.signupHook.signup(userData);
    }
  }

  get name() { return this.signupForm.get('name'); }
  get email() { return this.signupForm.get('email'); }
  get password() { return this.signupForm.get('password'); }
  get role() { return this.signupForm.get('role'); }
}
