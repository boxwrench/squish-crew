// Bounded admissible-motion fallback, mirrored in src/physics/orientation-safety.js.
// Moving one node makes every incident determinant LINEAR in that displacement.
// Starting from a valid pose therefore lets us clip that motion analytically,
// without iterative inversion repair or a global timestep/target slowdown.

static void mass_center(const double *x,double *center) {
  const double *mass=d64(mass_p);center[0]=center[1]=center[2]=0;
  for(uint32_t n=0;n<node_count;n++) {
    double w=mass[n]/total_mass;
    for(uint32_t axis=0;axis<3;axis++)center[axis]+=x[n*3+axis]*w;
  }
}

static void translate_to_center(double *x,const double *center,double floor) {
  double current[3];mass_center(x,current);
  double dx=center[0]-current[0],dy=center[1]-current[1],dz=center[2]-current[2];
  const uint32_t *ids=u32(contact_ids_p);const double *weights=d64(contact_weights_p);
  // A rigid lift keeps surface contacts outside the floor without undoing the
  // admissible deformation with another unconstrained contact projection.
  for(uint32_t c=0;c<contact_count;c++) {
    double y=0;for(uint32_t k=0;k<4;k++)y+=x[ids[c*4+k]*3+1]*weights[c*4+k];
    dy=dmax(dy,floor-y);
  }
  for(uint32_t n=0;n<node_count;n++){x[n*3]+=dx;x[n*3+1]+=dy;x[n*3+2]+=dz;}
}

static double accept_admissible_motion(double *x,const double *previous,double *candidate,double floor) {
  const uint32_t *offsets=u32(adjacency_offsets_p),*adjacent=u32(adjacency_elements_p);
  double *values=d64(repair_values_p),*safe=d64(safe_positions_p);
  const double *reference=minimum_jacobian(previous,.12)>=.12?previous:safe;
  double center[3];mass_center(x,center);
  uint32_t finite=1;
  for(uint32_t i=0;i<node_count*3;i++){candidate[i]=x[i];if(!__builtin_isfinite(x[i]))finite=0;x[i]=reference[i];}
  if(!finite)mass_center(reference,center);
  translate_to_center(x,center,floor);
  for(uint32_t e=0;e<element_count;e++)values[e]=tet_jacobian(e,x);

  // Fixed forward/reverse sweeps let independent parts continue deforming even
  // when one local direction is blocked. The pending pose never becomes a
  // reference, and no rejected displacement is carried as a target backlog.
  if(finite)for(uint32_t pass=0;pass<2;pass++)for(uint32_t v=0;v<node_count;v++) {
    uint32_t n=(pass&1)?node_count-1-v:v,j=n*3;
    double px=x[j],py=x[j+1],pz=x[j+2];
    double dx=candidate[j]-px,dy=candidate[j+1]-py,dz=candidate[j+2]-pz,alpha=1;
    x[j]=candidate[j];x[j+1]=candidate[j+1];x[j+2]=candidate[j+2];
    for(uint32_t i=offsets[n];i<offsets[n+1];i++) {
      uint32_t e=adjacent[i];double before=values[e],after=tet_jacobian(e,x),limit=dmin(before,.135);
      if(!__builtin_isfinite(after))alpha=0;
      else if(after<limit)alpha=dmin(alpha,.99*dmax(0,before-limit)/(before-after));
    }
    x[j]=px+alpha*dx;x[j+1]=py+alpha*dy;x[j+2]=pz+alpha*dz;
    for(uint32_t i=offsets[n];i<offsets[n+1];i++){uint32_t e=adjacent[i];values[e]=tet_jacobian(e,x);}
  }
  // Preserve the solved center displacement (and thus linear momentum) rather
  // than blending the entire body back in time when deformation is constrained.
  translate_to_center(x,center,floor);
  double minimum=minimum_jacobian(x,.12);
  if(minimum<.12) {
    // Roundoff or non-finite candidates must never poison the saved valid pose.
    for(uint32_t i=0;i<node_count*3;i++)x[i]=reference[i];
    translate_to_center(x,center,floor);minimum=minimum_jacobian(x,.12);
    if(minimum<.12){for(uint32_t i=0;i<node_count*3;i++)x[i]=safe[i];minimum=minimum_jacobian(x,-1.0/0.0);}
  }
  return minimum;
}
