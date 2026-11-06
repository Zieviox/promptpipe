// Bionic (Android's libc) lacks these pthread calls that Odin's core:thread
// makes. The core never cancels threads or changes scheduling, so no-ops do.
int pthread_setcancelstate(int state, int *old) { if (old) *old = 0; (void)state; return 0; }
int pthread_setcanceltype(int type, int *old) { if (old) *old = 0; (void)type; return 0; }
struct pthread_attr_t_;
int pthread_attr_setinheritsched(void *attr, int inherit) { (void)attr; (void)inherit; return 0; }
